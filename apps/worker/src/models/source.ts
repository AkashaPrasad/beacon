import type { OpportunityType, RefreshInterval, SourceHealth, SourceKind, SourceScope } from '@kestrel/shared';
import mongoose, { Schema, type Types } from 'mongoose';

/**
 * Machine-readable health detail written next to `health` / `errorReason` (the shared
 * `SourceHealth` enum has no "paused" value): `ok | auth | notfound | ratelimited | network
 * | parse | blocked | paused:credits | not_modified`.
 */
export type SourceHealthCode =
  | 'ok'
  | 'not_modified'
  | 'auth'
  | 'notfound'
  | 'ratelimited'
  | 'network'
  | 'parse'
  | 'blocked'
  | 'paused:credits';

export interface SourceConfigDoc {
  boardToken: string | null;
  feedUrl: string | null;
  provider: string | null;
  [extra: string]: unknown;
}

export interface SourceDoc {
  _id: Types.ObjectId;
  url: string;
  name: string;
  kind: SourceKind;
  scope: SourceScope;
  ownerId: Types.ObjectId | null;
  packId: string | null;
  typeTag: OpportunityType | null;
  enabled: boolean;
  refreshInterval: RefreshInterval;
  health: SourceHealth;
  healthCode: SourceHealthCode | null;
  lastCheckedAt: Date | null;
  lastSuccessAt: Date | null;
  listingsFound: number;
  errorReason: string | null;
  consecutiveFailures: number;
  config: SourceConfigDoc;
  etag: string | null;
  lastModified: string | null;
  companyDomain?: string | null;
  country?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// API-owned collection: strict:false so worker writes never strip fields the API adds.
const sourceSchema = new Schema<SourceDoc>(
  {
    url: { type: String, required: true },
    name: { type: String, required: true },
    kind: { type: String, required: true },
    scope: { type: String, default: 'community' },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    packId: { type: String, default: null },
    typeTag: { type: String, default: null },
    enabled: { type: Boolean, default: true },
    refreshInterval: { type: String, default: 'daily' },
    health: { type: String, default: 'pending' },
    healthCode: { type: String, default: null },
    lastCheckedAt: { type: Date, default: null },
    lastSuccessAt: { type: Date, default: null },
    listingsFound: { type: Number, default: 0 },
    errorReason: { type: String, default: null },
    consecutiveFailures: { type: Number, default: 0 },
    config: { type: Schema.Types.Mixed, default: () => ({ boardToken: null, feedUrl: null, provider: null }) },
    etag: { type: String, default: null },
    lastModified: { type: String, default: null },
  },
  { collection: 'sources', timestamps: true, strict: false, minimize: false },
);

export const SourceModel =
  (mongoose.models.Source as mongoose.Model<SourceDoc> | undefined) ??
  mongoose.model<SourceDoc>('Source', sourceSchema);

export type SourceRunStatus = 'ok' | 'not_modified' | 'error' | 'deferred';

export interface SourceRunDoc {
  _id: Types.ObjectId;
  sourceId: Types.ObjectId;
  reason: string;
  status: SourceRunStatus;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  found: number;
  new: number;
  updated: number;
  unchanged: number;
  errors: { kind: string; message: string }[];
  backend: string | null;
  creditsUsed: number;
}

const sourceRunSchema = new Schema<SourceRunDoc>(
  {
    sourceId: { type: Schema.Types.ObjectId, ref: 'Source', required: true },
    reason: { type: String, default: 'schedule' },
    status: { type: String, default: 'ok' },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, default: null },
    durationMs: { type: Number, default: null },
    found: { type: Number, default: 0 },
    new: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    unchanged: { type: Number, default: 0 },
    errors: { type: [new Schema({ kind: String, message: String }, { _id: false })], default: [] },
    backend: { type: String, default: null },
    creditsUsed: { type: Number, default: 0 },
  },
  { collection: 'sourceRuns', suppressReservedKeysWarning: true },
);
sourceRunSchema.index({ sourceId: 1, startedAt: -1 });
sourceRunSchema.index({ startedAt: 1 });

export const SourceRunModel =
  (mongoose.models.SourceRun as mongoose.Model<SourceRunDoc> | undefined) ??
  mongoose.model<SourceRunDoc>('SourceRun', sourceRunSchema);
