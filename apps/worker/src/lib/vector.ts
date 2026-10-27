import { Types } from 'mongoose';

import { EMBEDDING_DIM, type OpportunityType } from '@kestrel/shared';

import type { Logger } from '../logger.js';
import { nullLogger } from '../logger.js';
import { ListingModel } from '../models/index.js';

export interface VectorHit {
  listingId: string;
  /** Cosine similarity, −1..1. */
  score: number;
}

export interface VectorFilter {
  /** Only listings seen in one of these sources (`sourceIds` / `sourceId`). */
  sourceIds?: ReadonlySet<string>;
  type?: OpportunityType;
}

/** Stage-1 retrieval (BRIEF decision 4): Atlas `$vectorSearch` or an in-process cosine scan. */
export interface VectorIndex {
  readonly kind: 'atlas' | 'memory';
  search(query: readonly number[], k: number, filter?: VectorFilter): Promise<VectorHit[]>;
  /** Drop caches after bulk embedding writes. */
  invalidate(): void;
}

function normalise(v: ArrayLike<number>, out: Float32Array, offset: number): void {
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) norm += (v[i] ?? 0) ** 2;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < EMBEDDING_DIM; i++) out[offset + i] = (v[i] ?? 0) / norm;
}

/** Keeps the k best (score desc) without sorting everything. */
function topK(scores: Float32Array, ids: readonly string[], k: number): VectorHit[] {
  if (k <= 0) return [];
  const hits: VectorHit[] = [];
  let min = -Infinity;
  for (let i = 0; i < scores.length; i++) {
    const s = scores[i] ?? -1;
    if (hits.length < k) {
      hits.push({ listingId: ids[i] ?? '', score: s });
      if (hits.length === k) {
        hits.sort((a, b) => b.score - a.score);
        min = hits[k - 1]?.score ?? -Infinity;
      }
    } else if (s > min) {
      hits[k - 1] = { listingId: ids[i] ?? '', score: s };
      hits.sort((a, b) => b.score - a.score);
      min = hits[k - 1]?.score ?? -Infinity;
    }
  }
  return hits.sort((a, b) => b.score - a.score);
}

/**
 * In-memory cosine scan over every non-archived listing with an embedding, cached as one
 * Float32Array matrix (384 × n) for 5 minutes. 10k listings ≈ 15 MB.
 */
interface MatrixCache {
  ids: string[];
  types: string[];
  sources: string[][];
  matrix: Float32Array;
  loadedAt: number;
}

export class MemoryVectorIndex implements VectorIndex {
  readonly kind = 'memory' as const;
  private cache: MatrixCache | null = null;
  private loading: Promise<MatrixCache> | null = null;

  constructor(
    private readonly ttlMs = 5 * 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  invalidate(): void {
    this.cache = null;
  }

  private async load() {
    if (this.cache && this.now() - this.cache.loadedAt < this.ttlMs) return this.cache;
    this.loading ??= (async () => {
      const ids: string[] = [];
      const types: string[] = [];
      const sources: string[][] = [];
      const rows: number[][] = [];
      const cursor = ListingModel.find({ archived: false, 'embedding.0': { $exists: true } }, { embedding: 1, type: 1, sourceId: 1, sourceIds: 1 })
        .lean()
        .cursor({ batchSize: 500 });
      for await (const doc of cursor) {
        if (doc.embedding.length !== EMBEDDING_DIM) continue;
        ids.push(String(doc._id));
        types.push(doc.type);
        const own = (doc.sourceIds ?? []).map(String);
        sources.push(own.includes(String(doc.sourceId)) ? own : [String(doc.sourceId), ...own]);
        rows.push(doc.embedding);
      }
      const matrix = new Float32Array(rows.length * EMBEDDING_DIM);
      rows.forEach((row, i) => normalise(row, matrix, i * EMBEDDING_DIM));
      this.cache = { ids, types, sources, matrix, loadedAt: this.now() };
      return this.cache;
    })().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  async search(query: readonly number[], k: number, filter: VectorFilter = {}): Promise<VectorHit[]> {
    const { ids, types, sources, matrix } = await this.load();
    const q = new Float32Array(EMBEDDING_DIM);
    normalise(query, q, 0);
    const keptIds: string[] = [];
    const scores: number[] = [];
    for (let r = 0; r < ids.length; r++) {
      if (filter.type && types[r] !== filter.type) continue;
      if (filter.sourceIds && !(sources[r] ?? []).some((id) => filter.sourceIds?.has(id))) continue;
      let dot = 0;
      const base = r * EMBEDDING_DIM;
      for (let i = 0; i < EMBEDDING_DIM; i++) dot += (matrix[base + i] ?? 0) * (q[i] ?? 0);
      keptIds.push(ids[r] ?? '');
      scores.push(dot);
    }
    return topK(Float32Array.from(scores), keptIds, Math.min(k, keptIds.length));
  }
}

/**
 * Atlas Vector Search on `listings.embedding` (index needs `archived` as a filter field,
 * see docs/WORKER.md). Falls back to the memory scan when the index is missing.
 */
export class AtlasVectorIndex implements VectorIndex {
  readonly kind = 'atlas' as const;
  private fallbackUntil = 0;

  constructor(
    private readonly indexName: string,
    private readonly fallback: MemoryVectorIndex,
    private readonly logger: Logger = nullLogger,
  ) {}

  invalidate(): void {
    this.fallback.invalidate();
  }

  async search(query: readonly number[], k: number, filter: VectorFilter = {}): Promise<VectorHit[]> {
    if (Date.now() < this.fallbackUntil) return this.fallback.search(query, k, filter);
    try {
      // `type` and `archived` are filter fields of the index; source visibility is not, so
      // over-fetch and post-filter when it applies.
      const limit = filter.sourceIds ? Math.min(2_000, k * 5) : k;
      const sourceIds = filter.sourceIds ? [...filter.sourceIds].map((id) => new Types.ObjectId(id)) : null;
      const rows = await ListingModel.aggregate<{ _id: unknown; score: number }>([
        {
          $vectorSearch: {
            index: this.indexName,
            path: 'embedding',
            queryVector: [...query],
            numCandidates: Math.min(10_000, limit * 10),
            limit,
            filter: { archived: false, ...(filter.type ? { type: filter.type } : {}) },
          },
        },
        { $project: { _id: 1, sourceId: 1, sourceIds: 1, score: { $meta: 'vectorSearchScore' } } },
        ...(sourceIds ? [{ $match: { $or: [{ sourceIds: { $in: sourceIds } }, { sourceId: { $in: sourceIds } }] } }] : []),
        { $limit: k },
      ]);
      // Atlas cosine scores are (1 + cos) / 2.
      return rows.map((r) => ({ listingId: String(r._id), score: r.score * 2 - 1 }));
    } catch (err) {
      this.logger.warn({ err: err instanceof Error ? err.message : String(err) }, '$vectorSearch failed; using in-memory scan for 10 min');
      this.fallbackUntil = Date.now() + 10 * 60_000;
      return this.fallback.search(query, k, filter);
    }
  }
}

export function createVectorIndex(mode: 'atlas' | 'memory', indexName: string, logger: Logger): VectorIndex {
  const memory = new MemoryVectorIndex();
  return mode === 'atlas' ? new AtlasVectorIndex(indexName, memory, logger) : memory;
}
