import mongoose, { model, Schema, type Model, type Types } from 'mongoose';

import type {
  DeadlineKind,
  Eligibility,
  GhostRisk,
  OpportunityType,
  PayPeriod,
  RemoteMode,
} from '@kestrel/shared';

export interface ApplyCheck {
  status: 'ok' | 'dead' | 'redirect_home' | 'error';
  httpStatus: number | null;
  finalUrl: string | null;
  checkedAt: Date;
}

/** Written by the worker (ingest/extract/embed/ghostcheck); the API only reads it. */
export interface ListingDoc {
  _id: Types.ObjectId;
  type: OpportunityType;
  title: string;
  company: string;
  companyDomain: string | null;
  location: string[];
  remote: RemoteMode;
  country: string | null;
  stipendMin: number | null;
  stipendMax: number | null;
  currency: string | null;
  period: PayPeriod | null;
  postedAt: Date | null;
  deadlineAt: Date | null;
  eligibility: Eligibility;
  skillsRequired: string[];
  skillsNice: string[];
  descriptionMd: string;
  applyUrl: string;
  /** Last source that wrote the content. */
  sourceId: Types.ObjectId;
  /** Every source the listing was seen in (worker-maintained); visibility checks use both. */
  sourceIds?: Types.ObjectId[];
  canonicalKey: string;
  contentHash: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  seenCount: number;
  ghostRisk: GhostRisk;
  embedding: number[];
  deadlineKind: DeadlineKind;
  archived: boolean;
  roleFamily: string | null;
  applyCheck: ApplyCheck | null;
  createdAt: Date;
  updatedAt: Date;
}

const listingSchema = new Schema(
  {
    type: { type: String, required: true },
    title: { type: String, required: true },
    company: { type: String, required: true },
    companyDomain: { type: String, default: null },
    location: { type: [String], default: [] },
    remote: { type: String, default: 'unknown' },
    country: { type: String, default: null },
    stipendMin: { type: Number, default: null },
    stipendMax: { type: Number, default: null },
    currency: { type: String, default: null },
    period: { type: String, default: null },
    postedAt: { type: Date, default: null },
    deadlineAt: { type: Date, default: null },
    eligibility: {
      type: Schema.Types.Mixed,
      default: () => ({ gradYears: [], degrees: [], minExperienceYears: null, citizenship: [], other: [] }),
    },
    skillsRequired: { type: [String], default: [] },
    skillsNice: { type: [String], default: [] },
    descriptionMd: { type: String, default: '' },
    applyUrl: { type: String, required: true },
    sourceId: { type: Schema.Types.ObjectId, required: true, ref: 'Source', index: true },
    sourceIds: { type: [Schema.Types.ObjectId], default: undefined },
    canonicalKey: { type: String, required: true, unique: true },
    contentHash: { type: String, required: true },
    firstSeenAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    seenCount: { type: Number, default: 1 },
    ghostRisk: { type: Schema.Types.Mixed, default: () => ({ score: 0, reasons: [] }) },
    embedding: { type: [Number], default: [] },
    deadlineKind: { type: String, default: 'unknown' },
    archived: { type: Boolean, default: false },
    roleFamily: { type: String, default: null },
    applyCheck: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true, collection: 'listings', minimize: false },
);

listingSchema.index({ archived: 1, type: 1, deadlineAt: 1 });
listingSchema.index({ postedAt: -1 });
listingSchema.index({ company: 1 });

export const Listing: Model<ListingDoc> =
  (mongoose.models['Listing'] as Model<ListingDoc> | undefined) ?? model<ListingDoc>('Listing', listingSchema as unknown as Schema<ListingDoc>);
