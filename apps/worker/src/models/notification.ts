import type { AlertChannel, NotificationKind } from '@kestrel/shared';
import mongoose, { Schema, type Types } from 'mongoose';

export interface NotificationDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  kind: NotificationKind;
  title: string;
  body: string;
  url: string | null;
  listingId: Types.ObjectId | null;
  trackerItemId: Types.ObjectId | null;
  alertRuleId: Types.ObjectId | null;
  channels: AlertChannel[];
  readAt: Date | null;
  createdAt: Date;
  // ── worker-owned ──
  /** Idempotency key, e.g. "match:<user>:<listing>:<rule>"; unique per user. */
  dedupeKey: string;
  /** Push delivery state: none (in-app only), pending (quiet hours / cap), sent, failed. */
  pushStatus: 'none' | 'pending' | 'sent' | 'failed';
  /** When a pending push may be delivered (end of quiet hours). */
  pushAfter: Date | null;
}

const notificationSchema = new Schema<NotificationDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    url: { type: String, default: null },
    listingId: { type: Schema.Types.ObjectId, ref: 'Listing', default: null },
    trackerItemId: { type: Schema.Types.ObjectId, default: null },
    alertRuleId: { type: Schema.Types.ObjectId, default: null },
    channels: { type: [String], default: ['inapp'] },
    readAt: { type: Date, default: null },
    createdAt: { type: Date, required: true },
    dedupeKey: { type: String, required: true },
    pushStatus: { type: String, default: 'none' },
    pushAfter: { type: Date, default: null },
  },
  { collection: 'notifications', strict: false },
);
notificationSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true });
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ pushStatus: 1, pushAfter: 1 });

export const NotificationModel =
  (mongoose.models.Notification as mongoose.Model<NotificationDoc> | undefined) ??
  mongoose.model<NotificationDoc>('Notification', notificationSchema);
