import type { Types } from 'mongoose';

import { SourceModel, SubscriptionModel } from '../models/index.js';

/**
 * Which sources' listings a user sees. Same rule as the API (`services/visibility.ts`):
 * own personal sources + subscribed community sources; a user with neither sees every
 * community source. The worker only writes `matches` for visible listings, because the
 * API's warm feed shows every match doc without re-checking sources.
 */
export interface UserVisibility {
  sourceIds: ReadonlySet<string>;
  fallbackToCommunity: boolean;
}

export interface VisibleListing {
  sourceId: Types.ObjectId | string;
  /** Every source the listing was seen in (dedupe across sources); falls back to `sourceId`. */
  sourceIds?: readonly (Types.ObjectId | string)[] | null;
}

export function listingSourceIds(listing: VisibleListing): string[] {
  const ids = (listing.sourceIds ?? []).map(String);
  const primary = String(listing.sourceId);
  return ids.includes(primary) ? ids : [primary, ...ids];
}

export function isVisible(listing: VisibleListing, visibility: UserVisibility): boolean {
  return listingSourceIds(listing).some((id) => visibility.sourceIds.has(id));
}

/** Batch resolver; caches the community source list for the lifetime of one job. */
export class VisibilityResolver {
  private community: Promise<Set<string>> | null = null;

  private communityIds(): Promise<Set<string>> {
    this.community ??= SourceModel.find({ scope: 'community' }, { _id: 1 })
      .lean()
      .then((rows) => new Set(rows.map((r) => String(r._id))));
    return this.community;
  }

  async forUsers(userIds: readonly Types.ObjectId[]): Promise<Map<string, UserVisibility>> {
    const [personal, subscribed] = await Promise.all([
      SourceModel.find({ scope: 'personal', ownerId: { $in: userIds } }, { _id: 1, ownerId: 1 }).lean(),
      SubscriptionModel.find({ userId: { $in: userIds } }, { userId: 1, sourceId: 1 }).lean(),
    ]);
    const byUser = new Map<string, Set<string>>(userIds.map((id) => [String(id), new Set<string>()]));
    for (const s of personal) byUser.get(String(s.ownerId))?.add(String(s._id));
    for (const s of subscribed) byUser.get(String(s.userId))?.add(String(s.sourceId));
    const out = new Map<string, UserVisibility>();
    for (const [userId, ids] of byUser) {
      out.set(userId, ids.size > 0 ? { sourceIds: ids, fallbackToCommunity: false } : { sourceIds: await this.communityIds(), fallbackToCommunity: true });
    }
    return out;
  }

  async forUser(userId: Types.ObjectId): Promise<UserVisibility> {
    const map = await this.forUsers([userId]);
    return map.get(String(userId)) ?? { sourceIds: new Set(), fallbackToCommunity: true };
  }
}
