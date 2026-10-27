import type { Types } from 'mongoose';

import { Interaction, Match, Subscription } from '../models/activity.js';
import type { ListingDoc } from '../models/listing.js';
import { Source } from '../models/source.js';

export interface Visibility {
  /** Sources whose listings the user sees: own personal + subscribed community sources. */
  sourceIds: Types.ObjectId[];
  /** True when the user has no sources at all → every community source is visible. */
  fallbackToCommunity: boolean;
}

/**
 * Mongo filter: the listing was seen in one of `ids`. `sourceIds` (worker, every source a deduped
 * listing appeared in) is authoritative; `sourceId` covers listings written before it existed.
 */
export function visibleSourceFilter(ids: readonly Types.ObjectId[], prefix = ''): Record<string, unknown> {
  return { $or: [{ [`${prefix}sourceIds`]: { $in: [...ids] } }, { [`${prefix}sourceId`]: { $in: [...ids] } }] };
}

export function listingSourceIds(listing: Pick<ListingDoc, 'sourceId' | 'sourceIds'>): Types.ObjectId[] {
  return [...(listing.sourceIds ?? []), listing.sourceId].filter((id): id is Types.ObjectId => Boolean(id));
}

export async function getVisibility(userId: Types.ObjectId): Promise<Visibility> {
  const [personal, subscribed] = await Promise.all([
    Source.find({ scope: 'personal', ownerId: userId }).distinct('_id'),
    Subscription.find({ userId }).distinct('sourceId'),
  ]);
  const sourceIds = [...personal, ...subscribed] as Types.ObjectId[];
  if (sourceIds.length > 0) return { sourceIds, fallbackToCommunity: false };
  const community: Types.ObjectId[] = await Source.find({ scope: 'community' }).distinct('_id');
  return { sourceIds: community, fallbackToCommunity: true };
}

/** Whether a listing may be shown to the user (otherwise routes answer 404). */
export async function canSeeListing(
  userId: Types.ObjectId,
  listing: Pick<ListingDoc, '_id' | 'sourceId' | 'sourceIds'>,
  visibility?: Visibility,
): Promise<boolean> {
  const [match, interaction] = await Promise.all([
    Match.exists({ userId, listingId: listing._id }),
    Interaction.exists({ userId, listingId: listing._id }),
  ]);
  if (match || interaction) return true;
  const vis = visibility ?? (await getVisibility(userId));
  const seenIn = listingSourceIds(listing);
  return vis.sourceIds.some((id) => seenIn.some((s) => id.equals(s)));
}
