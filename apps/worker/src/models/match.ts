import mongoose, { Schema, type Types } from 'mongoose';

import type { FitResult, OpportunityType } from '@kestrel/shared';

/**
 * `matches`: one stage-2 fit result per (user, listing), written by the match queue.
 * Every `FitResult` field sits at the top level (API.md §12), plus worker bookkeeping.
 */
export type MatchDoc = FitResult & {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  listingId: Types.ObjectId;
  /** The profile's API-owned `profileHash` at compute time (explanations are keyed by it). */
  profileHash: string | null;
  /** Worker: hash of profile + weights + visible sources; a full recompute replaces other hashes. */
  matchHash: string;
  /** Cosine similarity used for the semantic term (null when an embedding was missing). */
  semantic: number | null;
  listingType: OpportunityType;
  listingDeadlineAt: Date | null;
  computedAt: Date;
};

const mixed = Schema.Types.Mixed;
const matchSchema = new Schema<MatchDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    listingId: { type: Schema.Types.ObjectId, ref: 'Listing', required: true },
    score: { type: Number, required: true },
    rawScore: Number,
    components: mixed,
    contributions: mixed,
    weights: mixed,
    caps: mixed,
    ghostPenalty: Number,
    hardFails: mixed,
    semanticAvailable: Boolean,
    details: mixed,
    explain: mixed,
    profileHash: { type: String, default: null },
    matchHash: { type: String, required: true },
    semantic: { type: Number, default: null },
    listingType: { type: String, required: true },
    listingDeadlineAt: { type: Date, default: null },
    computedAt: { type: Date, required: true },
  },
  { collection: 'matches', strict: false, minimize: false },
);
matchSchema.index({ userId: 1, listingId: 1 }, { unique: true });
matchSchema.index({ userId: 1, score: -1 });
matchSchema.index({ listingId: 1 });

export const MatchModel =
  (mongoose.models.Match as mongoose.Model<MatchDoc> | undefined) ?? mongoose.model<MatchDoc>('Match', matchSchema);

/** `explanations`: LLM "why it fits / gaps / tips", cached per (listing, profileHash). API-owned. */
export interface ExplanationDoc {
  _id: Types.ObjectId;
  listingId: Types.ObjectId;
  profileHash: string;
  createdAt: Date;
}
const explanationSchema = new Schema<ExplanationDoc>(
  {
    listingId: { type: Schema.Types.ObjectId, ref: 'Listing', required: true },
    profileHash: { type: String, required: true },
  },
  { collection: 'explanations', timestamps: true, strict: false },
);
export const ExplanationModel =
  (mongoose.models.Explanation as mongoose.Model<ExplanationDoc> | undefined) ??
  mongoose.model<ExplanationDoc>('Explanation', explanationSchema);
