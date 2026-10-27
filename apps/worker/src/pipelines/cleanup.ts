import { DAY_MS, LISTING_ARCHIVE_AFTER_DAYS } from '@kestrel/shared';
import type { Queue } from 'bullmq';

import { ListingModel, MatchModel, SourceRunModel } from '../models/index.js';

import type { PipelineDeps } from './deps.js';

export const SOURCE_RUN_RETENTION_DAYS = 30;
export const DLQ_RETENTION_DAYS = 7;

export interface CleanupOutcome {
  archived: number;
  matchesPruned: number;
  sourceRunsPruned: number;
  deadLettersPruned: number;
}

/** Archive listings unseen for 60 d, prune their matches, old sourceRuns and DLQ entries > 7 d. */
export async function runCleanup(deps: PipelineDeps, deadLetter: Pick<Queue, 'clean'> | null): Promise<CleanupOutcome> {
  const now = deps.now().getTime();
  const cutoff = new Date(now - LISTING_ARCHIVE_AFTER_DAYS * DAY_MS);
  const stale = await ListingModel.find({ archived: false, lastSeenAt: { $lt: cutoff } }, { _id: 1 }).lean();
  const ids = stale.map((s) => s._id);
  let archived = 0;
  let matchesPruned = 0;
  if (ids.length) {
    archived = (await ListingModel.updateMany({ _id: { $in: ids } }, { $set: { archived: true } })).modifiedCount;
    matchesPruned = (await MatchModel.deleteMany({ listingId: { $in: ids } })).deletedCount;
    deps.vector.invalidate();
  }
  const sourceRunsPruned = (await SourceRunModel.deleteMany({ startedAt: { $lt: new Date(now - SOURCE_RUN_RETENTION_DAYS * DAY_MS) } })).deletedCount;
  let deadLettersPruned = 0;
  if (deadLetter) {
    const grace = DLQ_RETENTION_DAYS * DAY_MS;
    deadLettersPruned = (await deadLetter.clean(grace, 10_000, 'wait')).length + (await deadLetter.clean(grace, 10_000, 'completed')).length;
  }
  return { archived, matchesPruned, sourceRunsPruned, deadLettersPruned };
}
