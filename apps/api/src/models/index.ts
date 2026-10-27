import {
  AlertRule,
  Explanation,
  Interaction,
  Match,
  Notification,
  PushSubscription,
  Subscription,
  TrackerItem,
} from './activity.js';
import { Listing } from './listing.js';
import { Profile } from './profile.js';
import { Settings } from './settings.js';
import { Source } from './source.js';
import { User } from './user.js';

export * from './activity.js';
export * from './listing.js';
export * from './profile.js';
export * from './settings.js';
export * from './source.js';
export * from './user.js';

export const ALL_MODELS = [
  User,
  Profile,
  Settings,
  Source,
  Subscription,
  Listing,
  Match,
  Interaction,
  Explanation,
  TrackerItem,
  AlertRule,
  Notification,
  PushSubscription,
] as const;

/**
 * One-off index migrations. `users.googleSub_1` (unique, not partial) predates email + password
 * accounts and would reject a second user with `googleSub: null`, so it is replaced by
 * `googleSub_partial_unique`.
 */
export async function migrateIndexes(): Promise<string[]> {
  const dropped: string[] = [];
  const indexes = await User.collection.indexes().catch(() => []);
  for (const index of indexes) {
    if (index.name === 'googleSub_1' && !index.partialFilterExpression) {
      await User.collection.dropIndex('googleSub_1');
      dropped.push('users.googleSub_1');
    }
  }
  return dropped;
}

/** Build every declared index (idempotent). Called on boot and in tests. */
export async function ensureIndexes(): Promise<string[]> {
  const dropped = await migrateIndexes();
  await Promise.all(ALL_MODELS.map((m) => (m as { createIndexes: () => Promise<unknown> }).createIndexes()));
  return dropped;
}
