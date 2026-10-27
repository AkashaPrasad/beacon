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

/** Build every declared index (idempotent). Called on boot and in tests. */
export async function ensureIndexes(): Promise<void> {
  await Promise.all(ALL_MODELS.map((m) => (m as { createIndexes: () => Promise<unknown> }).createIndexes()));
}
