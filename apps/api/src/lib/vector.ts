/**
 * Stage-1 vector retrieval adapter. `VECTOR_SEARCH=atlas` → Atlas `$vectorSearch` on
 * `listings.embedding` (index `listings_embedding`); `memory` (tests, fallback) → in-process
 * cosine scan over a lazily loaded Float32Array matrix with a TTL.
 */
import { type Types } from 'mongoose';

import { EMBEDDING_DIM, type OpportunityType } from '@kestrel/shared';

import type { Logger } from '../logger.js';
import { Listing } from '../models/listing.js';

export interface VectorFilters {
  types?: readonly OpportunityType[];
  /** Exclude listings whose deadline passed before this instant (null deadlines kept). */
  deadlineAfter?: Date;
  sourceIds?: readonly Types.ObjectId[];
  excludeIds?: readonly Types.ObjectId[];
}

export interface VectorCandidate {
  listingId: string;
  similarity: number;
}

export interface VectorConfig {
  mode: 'atlas' | 'memory';
  cacheTtlMs: number;
  indexName: string;
  logger?: Logger;
}

const config: VectorConfig = { mode: 'memory', cacheTtlMs: 5 * 60_000, indexName: 'listings_embedding' };

export function configureVector(options: Partial<VectorConfig>): void {
  Object.assign(config, options);
}

interface MatrixCache {
  ids: string[];
  types: string[];
  deadlines: (number | null)[];
  /** Every source each row was seen in (`sourceIds` plus `sourceId`). */
  sources: string[][];
  matrix: Float32Array;
  norms: Float32Array;
  loadedAt: number;
}

let cache: MatrixCache | null = null;
let loading: Promise<MatrixCache> | null = null;

export function invalidateVectorCache(): void {
  cache = null;
}

async function loadMatrix(): Promise<MatrixCache> {
  const docs = await Listing.find(
    { archived: { $ne: true }, [`embedding.${EMBEDDING_DIM - 1}`]: { $exists: true } },
    { embedding: 1, type: 1, deadlineAt: 1, sourceId: 1, sourceIds: 1 },
  ).lean<
    {
      _id: Types.ObjectId;
      embedding: number[];
      type: string;
      deadlineAt: Date | null;
      sourceId: Types.ObjectId;
      sourceIds?: Types.ObjectId[];
    }[]
  >();
  const n = docs.length;
  const matrix = new Float32Array(n * EMBEDDING_DIM);
  const norms = new Float32Array(n);
  docs.forEach((doc, row) => {
    let sum = 0;
    for (let j = 0; j < EMBEDDING_DIM; j += 1) {
      const v = doc.embedding[j] ?? 0;
      matrix[row * EMBEDDING_DIM + j] = v;
      sum += v * v;
    }
    norms[row] = Math.sqrt(sum);
  });
  return {
    ids: docs.map((d) => d._id.toString()),
    types: docs.map((d) => d.type),
    deadlines: docs.map((d) => (d.deadlineAt ? new Date(d.deadlineAt).getTime() : null)),
    sources: docs.map((d) => [...new Set([d.sourceId, ...(d.sourceIds ?? [])].map(String))]),
    matrix,
    norms,
    loadedAt: Date.now(),
  };
}

async function getMatrix(): Promise<MatrixCache> {
  if (cache && Date.now() - cache.loadedAt < config.cacheTtlMs) return cache;
  loading ??= loadMatrix().finally(() => {
    loading = null;
  });
  cache = await loading;
  return cache;
}

async function memorySearch(query: readonly number[], filters: VectorFilters, k: number): Promise<VectorCandidate[]> {
  const m = await getMatrix();
  let qNorm = 0;
  for (let j = 0; j < EMBEDDING_DIM; j += 1) qNorm += (query[j] ?? 0) ** 2;
  qNorm = Math.sqrt(qNorm);
  if (qNorm === 0) return [];
  const types = filters.types?.length ? new Set<string>(filters.types) : null;
  const sources = filters.sourceIds ? new Set(filters.sourceIds.map(String)) : null;
  const exclude = new Set((filters.excludeIds ?? []).map(String));
  const after = filters.deadlineAfter?.getTime();
  const scored: VectorCandidate[] = [];
  for (let row = 0; row < m.ids.length; row += 1) {
    const id = m.ids[row]!;
    if (exclude.has(id)) continue;
    if (types && !types.has(m.types[row]!)) continue;
    if (sources && !m.sources[row]!.some((s) => sources.has(s))) continue;
    const deadline = m.deadlines[row];
    if (after !== undefined && deadline !== null && deadline !== undefined && deadline < after) continue;
    const norm = m.norms[row]!;
    if (norm === 0) continue;
    let dot = 0;
    const offset = row * EMBEDDING_DIM;
    for (let j = 0; j < EMBEDDING_DIM; j += 1) dot += m.matrix[offset + j]! * (query[j] ?? 0);
    scored.push({ listingId: id, similarity: dot / (norm * qNorm) });
  }
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, k);
}

/** Build the `$vectorSearch` stage (exported for tests). */
export function vectorSearchPipeline(query: readonly number[], filters: VectorFilters, k: number): Record<string, unknown>[] {
  const filter: Record<string, unknown> = { archived: false };
  if (filters.types?.length) filter['type'] = { $in: [...filters.types] };
  if (filters.deadlineAfter) {
    filter['$or'] = [{ deadlineAt: null }, { deadlineAt: { $gte: filters.deadlineAfter } }];
  }
  const post: Record<string, unknown> = {};
  if (filters.sourceIds) {
    post['$or'] = [{ sourceIds: { $in: [...filters.sourceIds] } }, { sourceId: { $in: [...filters.sourceIds] } }];
  }
  if (filters.excludeIds?.length) post['_id'] = { $nin: [...filters.excludeIds] };
  const overfetch = Object.keys(post).length ? Math.min(k * 4, 2_000) : k;
  return [
    {
      $vectorSearch: {
        index: config.indexName,
        path: 'embedding',
        queryVector: [...query],
        numCandidates: Math.min(overfetch * 10, 10_000),
        limit: overfetch,
        filter,
      },
    },
    ...(Object.keys(post).length ? [{ $match: post }] : []),
    { $limit: k },
    { $project: { _id: 1, similarity: { $meta: 'vectorSearchScore' } } },
  ];
}

/**
 * Top-k listings nearest to `userEmbedding` (cosine). Atlas scores are in [0, 1]
 * (`(1 + cos) / 2`); memory mode returns raw cosine. Both are ordered best-first.
 */
export async function candidatesForUser(
  userEmbedding: readonly number[],
  filters: VectorFilters = {},
  k = 200,
): Promise<VectorCandidate[]> {
  if (userEmbedding.length !== EMBEDDING_DIM) return [];
  if (config.mode === 'atlas') {
    try {
      const rows = await Listing.aggregate<{ _id: Types.ObjectId; similarity: number }>(
        vectorSearchPipeline(userEmbedding, filters, k) as never[],
      );
      return rows.map((r) => ({ listingId: r._id.toString(), similarity: r.similarity }));
    } catch (err) {
      config.logger?.warn({ err: (err as Error).message }, '$vectorSearch failed; falling back to memory scan');
    }
  }
  return memorySearch(userEmbedding, filters, k);
}
