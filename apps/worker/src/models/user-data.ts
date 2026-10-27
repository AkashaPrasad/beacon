import mongoose, { Schema, type Types } from 'mongoose';

import type {
  AlertConditions,
  AlertChannel,
  AlertCadence,
  NotificationSettings,
  Profile,
  QuietHours,
  TrackerItem,
  WeightsInput,
} from '@kestrel/shared';

// API-owned collections. The worker reads them and writes only the fields it owns
// (profile embedding, tracker nudges, rule lastTriggeredAt, push subscription pruning).
// strict:false keeps the worker from stripping fields the API defines.
const loose = { strict: false, minimize: false } as const;

export interface UserDoc {
  _id: Types.ObjectId;
  email: string;
  name: string;
  role: 'user' | 'admin';
  createdAt: Date;
}
const userSchema = new Schema<UserDoc>(
  { email: String, name: String, role: { type: String, default: 'user' } },
  { collection: 'users', timestamps: true, ...loose },
);
export const UserModel =
  (mongoose.models.User as mongoose.Model<UserDoc> | undefined) ?? mongoose.model<UserDoc>('User', userSchema);

/** Lowest stage-1 similarity that made the candidate set at the last full recompute. */
export interface MatchFloors {
  overall: number;
  byType: Partial<Record<string, number>>;
}

export type ProfileDoc = Omit<Profile, 'userId'> & {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  /** API-owned hash of the profile fields (explanations are cached by it). */
  profileHash?: string | null;
  /** 384-d profile embedding (worker-owned). */
  embedding?: number[];
  /** Hash of the profile text the embedding was computed from (worker-owned). */
  embeddingHash: string | null;
  embeddedAt?: Date | null;
  embeddingModel?: string | null;
  /** Worker-owned: hash of profile + weights + visible sources the stored matches were computed with. */
  matchHash?: string | null;
  /** Worker-owned: incremental matching only keeps listings that would have made stage 1. */
  matchFloors?: MatchFloors | null;
  updatedAt?: Date;
};
const profileSchema = new Schema<ProfileDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    embedding: { type: [Number], default: undefined },
    embeddingHash: { type: String, default: null },
    embeddingModel: { type: String, default: null },
    matchHash: { type: String, default: null },
  },
  { collection: 'profiles', timestamps: true, ...loose },
);
export const ProfileModel =
  (mongoose.models.Profile as mongoose.Model<ProfileDoc> | undefined) ??
  mongoose.model<ProfileDoc>('Profile', profileSchema);

export interface SettingsDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  weights?: Partial<WeightsInput>;
  notifications?: Partial<NotificationSettings>;
  ai?: { enabled?: boolean };
}
const settingsSchema = new Schema<SettingsDoc>(
  { userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true } },
  { collection: 'settings', timestamps: true, ...loose },
);
export const SettingsModel =
  (mongoose.models.Settings as mongoose.Model<SettingsDoc> | undefined) ??
  mongoose.model<SettingsDoc>('Settings', settingsSchema);

export type TrackerItemDoc = Omit<TrackerItem, 'id' | 'userId' | 'listingId' | 'sourceId'> & {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  listingId: Types.ObjectId | null;
  sourceId: Types.ObjectId | null;
  /** Worker-owned: reminder days already sent for the current deadline, e.g. [7, 3]. */
  remindersSent?: number[];
};
const trackerItemSchema = new Schema<TrackerItemDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    listingId: { type: Schema.Types.ObjectId, ref: 'Listing', default: null },
    sourceId: { type: Schema.Types.ObjectId, ref: 'Source', default: null },
  },
  { collection: 'tracker_items', timestamps: true, ...loose },
);
export const TrackerItemModel =
  (mongoose.models.TrackerItem as mongoose.Model<TrackerItemDoc> | undefined) ??
  mongoose.model<TrackerItemDoc>('TrackerItem', trackerItemSchema);

export interface AlertRuleDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  enabled: boolean;
  conditions: AlertConditions;
  channels: AlertChannel[];
  cadence: AlertCadence;
  digestTime: string;
  digestDay: number;
  quietHours: QuietHours | null;
  timezone: string;
  lastTriggeredAt: Date | null;
  /** Worker-owned: last digest send (dedupes the hourly tick). */
  lastDigestAt?: Date | null;
}
const alertRuleSchema = new Schema<AlertRuleDoc>(
  { userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true } },
  { collection: 'alert_rules', timestamps: true, ...loose },
);
export const AlertRuleModel =
  (mongoose.models.AlertRule as mongoose.Model<AlertRuleDoc> | undefined) ??
  mongoose.model<AlertRuleDoc>('AlertRule', alertRuleSchema);

export interface PushSubscriptionDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  expirationTime?: number | null;
  lastUsedAt?: Date | null;
}
const pushSubscriptionSchema = new Schema<PushSubscriptionDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
  },
  { collection: 'push_subscriptions', timestamps: true, ...loose },
);
export const PushSubscriptionModel =
  (mongoose.models.PushSubscription as mongoose.Model<PushSubscriptionDoc> | undefined) ??
  mongoose.model<PushSubscriptionDoc>('PushSubscription', pushSubscriptionSchema);

/** `subscriptions` (API-owned): user ↔ community source. Read for listing visibility. */
export interface SubscriptionDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  sourceId: Types.ObjectId;
  packId: string | null;
}
const subscriptionSchema = new Schema<SubscriptionDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sourceId: { type: Schema.Types.ObjectId, ref: 'Source', required: true },
    packId: { type: String, default: null },
  },
  { collection: 'subscriptions', ...loose },
);
export const SubscriptionModel =
  (mongoose.models.Subscription as mongoose.Model<SubscriptionDoc> | undefined) ??
  mongoose.model<SubscriptionDoc>('Subscription', subscriptionSchema);

/** `interactions` (API-owned): saved / hidden flags. Saved listings get deadline reminders. */
export interface InteractionDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  listingId: Types.ObjectId;
  saved: boolean;
  hidden: boolean;
}
const interactionSchema = new Schema<InteractionDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    listingId: { type: Schema.Types.ObjectId, ref: 'Listing', required: true },
    saved: { type: Boolean, default: false },
    hidden: { type: Boolean, default: false },
  },
  { collection: 'interactions', timestamps: true, ...loose },
);
export const InteractionModel =
  (mongoose.models.Interaction as mongoose.Model<InteractionDoc> | undefined) ??
  mongoose.model<InteractionDoc>('Interaction', interactionSchema);
