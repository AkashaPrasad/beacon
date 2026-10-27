import type { OpportunityType, RefreshInterval, SourceHealth, SourceKind, SourceScope } from '@kestrel/shared';
import { model, models, Schema, type Model, type Types } from 'mongoose';

export interface SourceConfigDoc {
  boardToken: string | null;
  feedUrl: string | null;
  provider: string | null;
  /** Extensions for the worker: endpoint, HTTP method/body, Workday tenant/site/host. */
  apiUrl?: string | null;
  method?: 'GET' | 'POST' | null;
  body?: unknown;
  headers?: Record<string, string> | null;
  tenant?: string | null;
  site?: string | null;
  wdHost?: string | null;
}

export interface SourceDoc {
  _id: Types.ObjectId;
  url: string;
  name: string;
  kind: SourceKind;
  scope: SourceScope;
  ownerId: Types.ObjectId | null;
  packId: string | null;
  packIds: string[];
  typeTag: OpportunityType | null;
  enabled: boolean;
  refreshInterval: RefreshInterval;
  health: SourceHealth;
  lastCheckedAt: Date | null;
  listingsFound: number;
  errorReason: string | null;
  config: SourceConfigDoc;
  etag: string | null;
  lastModified: string | null;
  companyDomain: string | null;
  country: string | null;
  tags: string[];
  /** Community sources only: identity used by the seed loader (normalised URL). */
  seedKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const sourceSchema = new Schema(
  {
    url: { type: String, required: true },
    name: { type: String, required: true },
    kind: { type: String, required: true },
    scope: { type: String, enum: ['personal', 'community'], required: true },
    ownerId: { type: Schema.Types.ObjectId, default: null, ref: 'User', index: true },
    packId: { type: String, default: null },
    packIds: { type: [String], default: [] },
    typeTag: { type: String, default: null },
    enabled: { type: Boolean, default: true },
    refreshInterval: { type: String, default: 'daily' },
    health: { type: String, default: 'pending' },
    lastCheckedAt: { type: Date, default: null },
    listingsFound: { type: Number, default: 0 },
    errorReason: { type: String, default: null },
    config: { type: Schema.Types.Mixed, default: () => ({ boardToken: null, feedUrl: null, provider: null }) },
    etag: { type: String, default: null },
    lastModified: { type: String, default: null },
    companyDomain: { type: String, default: null },
    country: { type: String, default: null },
    tags: { type: [String], default: [] },
    seedKey: { type: String, default: null },
  },
  { timestamps: true, collection: 'sources', minimize: false },
);

sourceSchema.index({ scope: 1, packIds: 1 });
sourceSchema.index(
  { ownerId: 1, url: 1 },
  { unique: true, partialFilterExpression: { scope: 'personal' } },
);
sourceSchema.index({ seedKey: 1 }, { unique: true, partialFilterExpression: { seedKey: { $type: 'string' } } });

export const Source: Model<SourceDoc> =
  (models['Source'] as Model<SourceDoc> | undefined) ?? model<SourceDoc>('Source', sourceSchema as unknown as Schema<SourceDoc>);
