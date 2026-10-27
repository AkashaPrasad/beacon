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

export async function getVisibility(userId: Types.ObjectId): Promise<Visibility> {
  const [personal, subscribed] = await Promise.all([
    Source.find({ scope: 'personal', ownerId: userId }).distinct('_id'),
    Subscription.find({ userId }).distinct('sourceId'),
  ]);
  const sourceIds = [...personal, ...subscribed] as Types.ObjectId[];
  if (sourceIds.length > 0) return { sourceIds, fallbackToCommunity: false };
  const community = (await Source.find({ scope: 'community' }).distinct('_id')) as Types.ObjectId[];
  return { sourceIds: community, fallbackToCommunity: true };
}

/** Whether a listing may be shown to the user (otherwise routes answer 404). */
export async function canSeeListing(
  userId: Types.ObjectId,
  listing: Pick<ListingDoc, '_id' | 'sourceId'>,
  visibility?: Visibility,
): Promise<boolean> {
  const [match, interaction] = await Promise.all([
    Match.exists({ userId, listingId: listing._id }),
    Interaction.exists({ userId, listingId: listing._id }),
  ]);
  if (match || interaction) return true;
  const vis = visibility ?? (await getVisibility(userId));
  return vis.sourceIds.some((id) => id.equals(listing.sourceId));
}
