import type { FitResult, OpportunityType } from '@kestrel/shared';
import mongoose, { Schema, type Types } from 'mongoose';

/** `matches`: one stage-2 fit result per (user, listing). Written by the match queue. */
export interface MatchDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  listingId: Types.ObjectId;
  score: number;
  fit: FitResult;
  /** Cosine similarity used for the semantic term (null when an embedding was missing). */
  semantic: number | null;
  /** Hash of profile text + weights at compute time; stale when it differs from the profile's. */
  profileHash: string;
  listingType: OpportunityType;
  listingDeadlineAt: Date | null;
  computedAt: Date;
}

const matchSchema = new Schema<MatchDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    listingId: { type: Schema.Types.ObjectId, ref: 'Listing', required: true },
    score: { type: Number, required: true },
    fit: { type: Schema.Types.Mixed, required: true },
    semantic: { type: Number, default: null },
    profileHash: { type: String, required: true },
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
