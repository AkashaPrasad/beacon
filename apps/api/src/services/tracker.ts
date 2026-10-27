/** Tracker item creation and column upkeep, shared by /v1/tracker and listing save/unsave. */
import type { Types } from 'mongoose';

import type { AppContext } from '../context.js';
import { TrackerItem, type TrackerItemDoc } from '../models/activity.js';
import type { ListingDoc } from '../models/listing.js';

export const APPLIED_STAGES = new Set<string>([
  'applied',
  'oa',
  'interview',
  'offer',
  'rejected',
  'ghosted',
]);

/** The tracker fields copied from a listing when it is tracked. */
export function trackerFieldsFor(listing: ListingDoc): Partial<TrackerItemDoc> {
  return {
    listingId: listing._id,
    title: listing.title,
    company: listing.company,
    type: listing.type,
    applyUrl: listing.applyUrl,
    deadlineAt: listing.deadlineAt ?? null,
    sourceId: listing.sourceId,
  };
}

/** New items go to the top of their column (position 0); the rest of the column shifts down. */
export async function createTrackerItem(
  ctx: AppContext,
  userId: Types.ObjectId,
  fields: Partial<TrackerItemDoc>,
  stage: string,
  notes = '',
): Promise<TrackerItemDoc> {
  const now = ctx.now();
  await TrackerItem.updateMany({ userId, stage }, { $inc: { position: 1 } });
  const created = await TrackerItem.create({
    ...fields,
    userId,
    stage,
    position: 0,
    notes,
    appliedAt: stage !== 'saved' && APPLIED_STAGES.has(stage) ? now : null,
    lastActivityAt: now,
    history: [{ stage, at: now }],
  });
  return created.toObject();
}

/** Re-number a column to 0..n-1 (after a delete). */
export async function compactColumn(userId: Types.ObjectId, stage: string): Promise<void> {
  const rest = await TrackerItem.find({ userId, stage }, { _id: 1 })
    .sort({ position: 1, createdAt: 1 })
    .lean<{ _id: Types.ObjectId }[]>();
  if (!rest.length) return;
  await TrackerItem.bulkWrite(
    rest.map((r, position) => ({
      updateOne: { filter: { _id: r._id, userId }, update: { $set: { position } } },
    })),
  );
}

export interface TrackerRef {
  id: string;
  stage: string;
}

export const toTrackerRef = (
  doc: { _id: Types.ObjectId; stage: string } | null | undefined,
): TrackerRef | null => (doc ? { id: doc._id.toString(), stage: doc.stage } : null);
