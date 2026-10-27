import type { FitResult } from '@kestrel/shared';
import { model, models, Schema, type Model, type Types } from 'mongoose';

const mixed = Schema.Types.Mixed;
const oid = Schema.Types.ObjectId;

function getModel<T>(name: string, schema: Schema): Model<T> {
  return (models[name] as Model<T> | undefined) ?? model<T>(name, schema as unknown as Schema<T>);
}

// ── matches (worker writes; api reads) ───────────────────────────────────────

export type MatchDoc = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  listingId: Types.ObjectId;
  computedAt: Date;
  profileHash: string | null;
} & Partial<FitResult> & { score: number };

const matchSchema = new Schema(
  {
    userId: { type: oid, required: true },
    listingId: { type: oid, required: true },
    score: { type: Number, required: true },
    rawScore: Number,
    components: mixed,
    contributions: mixed,
    weights: mixed,
    caps: { type: [mixed], default: undefined },
    ghostPenalty: Number,
    hardFails: { type: [mixed], default: undefined },
    semanticAvailable: Boolean,
    details: mixed,
    explain: mixed,
    computedAt: { type: Date, default: () => new Date() },
    profileHash: { type: String, default: null },
  },
  { collection: 'matches', minimize: false },
);
matchSchema.index({ userId: 1, score: -1 });
matchSchema.index({ userId: 1, listingId: 1 }, { unique: true });
export const Match = getModel<MatchDoc>('Match', matchSchema);

// ── subscriptions (user ↔ community source) ──────────────────────────────────

export interface SubscriptionDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  sourceId: Types.ObjectId;
  packId: string | null;
  createdAt: Date;
}
const subscriptionSchema = new Schema(
  {
    userId: { type: oid, required: true },
    sourceId: { type: oid, required: true, index: true },
    packId: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'subscriptions' },
);
subscriptionSchema.index({ userId: 1, sourceId: 1 }, { unique: true });
export const Subscription = getModel<SubscriptionDoc>('Subscription', subscriptionSchema);

// ── interactions (saved / hidden) ────────────────────────────────────────────

export interface InteractionDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  listingId: Types.ObjectId;
  saved: boolean;
  savedAt: Date | null;
  hidden: boolean;
  hiddenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
const interactionSchema = new Schema(
  {
    userId: { type: oid, required: true },
    listingId: { type: oid, required: true },
    saved: { type: Boolean, default: false },
    savedAt: { type: Date, default: null },
    hidden: { type: Boolean, default: false },
    hiddenAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'interactions' },
);
interactionSchema.index({ userId: 1, listingId: 1 }, { unique: true });
interactionSchema.index({ userId: 1, saved: 1 });
export const Interaction = getModel<InteractionDoc>('Interaction', interactionSchema);

// ── explanations (LLM "why fit / gaps / tips" cache) ─────────────────────────

export interface ExplanationDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  listingId: Types.ObjectId;
  profileHash: string;
  whyFit: string[];
  gaps: string[];
  tailoringTips: string[];
  model: string | null;
  source: 'llm' | 'deterministic';
  createdAt: Date;
}
const explanationSchema = new Schema(
  {
    userId: { type: oid, required: true },
    listingId: { type: oid, required: true },
    profileHash: { type: String, required: true },
    whyFit: { type: [String], default: [] },
    gaps: { type: [String], default: [] },
    tailoringTips: { type: [String], default: [] },
    model: { type: String, default: null },
    source: { type: String, default: 'llm' },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'explanations' },
);
explanationSchema.index({ userId: 1, listingId: 1, profileHash: 1 }, { unique: true });
export const Explanation = getModel<ExplanationDoc>('Explanation', explanationSchema);

// ── tracker_items ────────────────────────────────────────────────────────────

export interface TrackerItemDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  listingId: Types.ObjectId | null;
  title: string;
  company: string;
  type: string | null;
  applyUrl: string | null;
  deadlineAt: Date | null;
  sourceId: Types.ObjectId | null;
  stage: string;
  position: number;
  notes: string;
  contacts: Record<string, unknown>[];
  documents: Record<string, unknown>[];
  appliedAt: Date | null;
  lastActivityAt: Date;
  nudges: { kind: string; dueAt: Date; sentAt: Date | null; dismissedAt: Date | null }[];
  history: { stage: string; at: Date }[];
  createdAt: Date;
  updatedAt: Date;
}
const trackerSchema = new Schema(
  {
    userId: { type: oid, required: true },
    listingId: { type: oid, default: null },
    title: { type: String, required: true },
    company: { type: String, required: true },
    type: { type: String, default: null },
    applyUrl: { type: String, default: null },
    deadlineAt: { type: Date, default: null },
    sourceId: { type: oid, default: null },
    stage: { type: String, default: 'saved' },
    position: { type: Number, default: 0 },
    notes: { type: String, default: '' },
    contacts: { type: [mixed], default: [] },
    documents: { type: [mixed], default: [] },
    appliedAt: { type: Date, default: null },
    lastActivityAt: { type: Date, default: () => new Date() },
    nudges: { type: [mixed], default: [] },
    history: { type: [mixed], default: [] },
  },
  { timestamps: true, collection: 'tracker_items', minimize: false },
);
trackerSchema.index({ userId: 1, stage: 1, position: 1 });
trackerSchema.index({ userId: 1, listingId: 1 });
export const TrackerItem = getModel<TrackerItemDoc>('TrackerItem', trackerSchema);

// ── alert_rules ──────────────────────────────────────────────────────────────

export interface AlertRuleDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  enabled: boolean;
  conditions: Record<string, unknown>;
  channels: string[];
  cadence: string;
  digestTime: string;
  digestDay: number;
  quietHours: { start: string; end: string } | null;
  timezone: string;
  lastTriggeredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
const alertSchema = new Schema(
  {
    userId: { type: oid, required: true, index: true },
    name: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    conditions: { type: mixed, default: () => ({}) },
    channels: { type: [String], default: ['inapp', 'push'] },
    cadence: { type: String, default: 'instant' },
    digestTime: { type: String, default: '09:00' },
    digestDay: { type: Number, default: 1 },
    quietHours: { type: mixed, default: null },
    timezone: { type: String, default: 'Asia/Kolkata' },
    lastTriggeredAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'alert_rules', minimize: false },
);
export const AlertRule = getModel<AlertRuleDoc>('AlertRule', alertSchema);

// ── notifications (worker writes; api marks read) ────────────────────────────

export interface NotificationDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  listingId: Types.ObjectId | null;
  trackerItemId: Types.ObjectId | null;
  alertRuleId: Types.ObjectId | null;
  channels: string[];
  readAt: Date | null;
  createdAt: Date;
}
const notificationSchema = new Schema(
  {
    userId: { type: oid, required: true },
    kind: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    url: { type: String, default: null },
    listingId: { type: oid, default: null },
    trackerItemId: { type: oid, default: null },
    alertRuleId: { type: oid, default: null },
    channels: { type: [String], default: ['inapp'] },
    readAt: { type: Date, default: null },
    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: 'notifications' },
);
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1 });
export const Notification = getModel<NotificationDoc>('Notification', notificationSchema);

// ── push_subscriptions ───────────────────────────────────────────────────────

export interface PushSubscriptionDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  expirationTime: number | null;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
}
const pushSchema = new Schema(
  {
    userId: { type: oid, required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: { p256dh: { type: String, required: true }, auth: { type: String, required: true } },
    expirationTime: { type: Number, default: null },
    userAgent: { type: String, default: null },
  },
  { timestamps: true, collection: 'push_subscriptions' },
);
export const PushSubscription = getModel<PushSubscriptionDoc>('PushSubscription', pushSchema);
