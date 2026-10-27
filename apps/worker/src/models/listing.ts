import type {
  DeadlineKind,
  Eligibility,
  GhostRisk,
  OpportunityType,
  PayPeriod,
  RemoteMode,
  SourceKind,
} from '@kestrel/shared';
import mongoose, { Schema, type Types } from 'mongoose';

export type ExtractMethod = 'rules' | 'llm' | 'firecrawl' | 'none';

export interface ApplyUrlCheckDoc {
  status: number | null;
  finalUrl: string | null;
  redirectedToHome: boolean;
  error: string | null;
  checkedAt: Date;
}

/** `listings` document: the shared `Listing` shape plus worker-internal bookkeeping. */
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
  deadlineKind: DeadlineKind;
  eligibility: Eligibility;
  skillsRequired: string[];
  skillsNice: string[];
  descriptionMd: string;
  applyUrl: string;
  sourceId: Types.ObjectId;
  canonicalKey: string;
  contentHash: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  seenCount: number;
  ghostRisk: GhostRisk;
  embedding: number[];
  archived: boolean;
  roleFamily: string | null;
  // ── worker-internal (not part of the public contract) ──
  /** Every source this listing was seen in (dedupe across sources). */
  sourceIds: Types.ObjectId[];
  sourceKind: SourceKind | null;
  /** Stable id inside the source (ATS job id, API id, URL for crawls). */
  externalId: string | null;
  /** Source change marker (SmartRecruiters releasedDate) used to skip unchanged detail calls. */
  externalVersion: string | null;
  /** `normaliseUrl(applyUrl)`, second dedupe key. */
  applyUrlKey: string | null;
  /** True when the source gave structured fields (ATS/public API): rules-only extraction. */
  structured: boolean;
  /** contentHash that the last extract/embed ran on (cache keys: unchanged → skip). */
  extractedHash: string | null;
  extractMethod: ExtractMethod;
  embeddingHash: string | null;
  embeddingModel: string | null;
  /** Times the role reappeared after a gap or under a new URL. */
  repostCount: number;
  /** Raw postings at this company with the same normalised title in the last run. */
  identicalOpenRoles: number;
  applyUrlCheck: ApplyUrlCheckDoc | null;
  lastGhostCheckAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const eligibilitySchema = new Schema(
  {
    gradYears: { type: [Number], default: [] },
    degrees: { type: [String], default: [] },
    minExperienceYears: { type: Number, default: null },
    citizenship: { type: [String], default: [] },
    other: { type: [String], default: [] },
  },
  { _id: false },
);

const ghostRiskSchema = new Schema(
  {
    score: { type: Number, default: 0 },
    reasons: {
      type: [new Schema({ code: String, message: String, points: Number }, { _id: false })],
      default: [],
    },
  },
  { _id: false },
);

const listingSchema = new Schema<ListingDoc>(
  {
    type: { type: String, required: true, index: true },
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
    deadlineAt: { type: Date, default: null, index: true },
    deadlineKind: { type: String, default: 'unknown' },
    eligibility: { type: eligibilitySchema, default: () => ({}) },
    skillsRequired: { type: [String], default: [] },
    skillsNice: { type: [String], default: [] },
    descriptionMd: { type: String, default: '' },
    applyUrl: { type: String, required: true },
    sourceId: { type: Schema.Types.ObjectId, ref: 'Source', required: true },
    canonicalKey: { type: String, required: true, unique: true },
    contentHash: { type: String, required: true },
    firstSeenAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    seenCount: { type: Number, default: 1 },
    ghostRisk: { type: ghostRiskSchema, default: () => ({ score: 0, reasons: [] }) },
    embedding: { type: [Number], default: [] },
    archived: { type: Boolean, default: false },
    roleFamily: { type: String, default: null },
    sourceIds: { type: [Schema.Types.ObjectId], default: [], index: true },
    sourceKind: { type: String, default: null },
    externalId: { type: String, default: null },
    externalVersion: { type: String, default: null },
    applyUrlKey: { type: String, default: null, index: true },
    structured: { type: Boolean, default: false },
    extractedHash: { type: String, default: null },
    extractMethod: { type: String, default: 'none' },
    embeddingHash: { type: String, default: null },
    embeddingModel: { type: String, default: null },
    repostCount: { type: Number, default: 0 },
    identicalOpenRoles: { type: Number, default: 0 },
    applyUrlCheck: {
      type: new Schema(
        { status: Number, finalUrl: String, redirectedToHome: Boolean, error: String, checkedAt: Date },
        { _id: false },
      ),
      default: null,
    },
    lastGhostCheckAt: { type: Date, default: null },
  },
  { collection: 'listings', timestamps: true },
);

listingSchema.index({ sourceId: 1, lastSeenAt: -1 });
listingSchema.index({ archived: 1, lastSeenAt: -1 });
listingSchema.index({ archived: 1, embeddingHash: 1 });

export const ListingModel =
  (mongoose.models.Listing as mongoose.Model<ListingDoc> | undefined) ??
  mongoose.model<ListingDoc>('Listing', listingSchema);
