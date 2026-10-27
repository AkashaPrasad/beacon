import { EMBEDDING_DIM } from '@kestrel/shared';
import { Types } from 'mongoose';

import { EMBED_BATCH, embeddingHash, listingEmbeddingText, profileEmbeddingText } from '../lib/embeddings.js';
import { type ListingDoc, ListingModel, type ProfileDoc, ProfileModel } from '../models/index.js';

import type { PipelineDeps } from './deps.js';

export interface EmbedOutcome {
  embedded: number;
  skipped: number;
}

type EmbedRow = Pick<ListingDoc, '_id' | 'title' | 'company' | 'type' | 'skillsRequired' | 'skillsNice' | 'descriptionMd' | 'embeddingHash' | 'embedding' | 'contentHash'>;

/**
 * Embeds one listing — and opportunistically up to 15 others still waiting
 * (`embeddingHash: null`), so the model runs in batches of 16. Their own embed jobs then
 * find the work done and skip (idempotent).
 */
export async function embedListing(deps: PipelineDeps, listingId: string): Promise<EmbedOutcome> {
  const projection = { title: 1, company: 1, type: 1, skillsRequired: 1, skillsNice: 1, descriptionMd: 1, embeddingHash: 1, contentHash: 1, embedding: { $slice: 1 } } as const;
  const target = await ListingModel.findOne({ _id: listingId, archived: false }, projection).lean<EmbedRow>();
  if (!target) return { embedded: 0, skipped: 1 };
  const others = await ListingModel.find(
    { _id: { $ne: new Types.ObjectId(listingId) }, archived: false, embeddingHash: null },
    projection,
  )
    .limit(EMBED_BATCH - 1)
    .lean<EmbedRow[]>();

  const todo = [target, ...others]
    .map((row) => {
      const text = listingEmbeddingText(row);
      return { row, text, hash: embeddingHash(deps.embedder.model, text) };
    })
    .filter(({ row, hash }) => !(row.embeddingHash === hash && (row.embedding?.length ?? 0) > 0));
  if (todo.length === 0) return { embedded: 0, skipped: 1 };

  const vectors = await deps.embedder.embed(todo.map((t) => t.text));
  const ops = todo.flatMap(({ row, hash }, i) => {
    const vector = vectors[i];
    if (!vector || vector.length !== EMBEDDING_DIM) return [];
    return [
      {
        updateOne: {
          // Guard on contentHash: if ingest changed the listing meanwhile, its new embed job redoes it.
          filter: { _id: row._id, contentHash: row.contentHash },
          update: { $set: { embedding: vector, embeddingHash: hash, embeddingModel: deps.embedder.model } },
        },
      },
    ];
  });
  if (ops.length) await ListingModel.bulkWrite(ops, { ordered: false });
  deps.vector.invalidate();
  deps.metrics.inc('beacon_worker_embeddings_total', { kind: 'listing' }, ops.length, 'Embeddings computed');
  return { embedded: ops.length, skipped: 0 };
}

/** Profile embedding, recomputed only when the profile text changes; then rescoring. */
export async function embedUser(deps: PipelineDeps, userId: string): Promise<EmbedOutcome & { changed: boolean }> {
  const profile = await ProfileModel.findOne({ userId: new Types.ObjectId(userId) }).lean<ProfileDoc>();
  if (!profile) return { embedded: 0, skipped: 1, changed: false };
  const text = profileEmbeddingText(profile);
  const hash = embeddingHash(deps.embedder.model, text);
  if (profile.embeddingHash === hash && (profile.embedding?.length ?? 0) === EMBEDDING_DIM) {
    return { embedded: 0, skipped: 1, changed: false };
  }
  const [vector] = await deps.embedder.embed([text]);
  if (!vector || vector.length !== EMBEDDING_DIM) throw new Error('embedder returned no vector');
  await ProfileModel.updateOne({ _id: profile._id }, { $set: { embedding: vector, embeddingHash: hash, embeddingModel: deps.embedder.model } });
  deps.metrics.inc('beacon_worker_embeddings_total', { kind: 'profile' }, 1);
  await deps.enqueue.match({ userId });
  return { embedded: 1, skipped: 0, changed: true };
}
