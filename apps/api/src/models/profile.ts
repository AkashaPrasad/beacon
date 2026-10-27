import mongoose, { model, Schema, type Model, type Types } from 'mongoose';

import type { ProfileInput } from '@kestrel/shared';

export interface ResumeMeta {
  fileName: string;
  mimeType: string;
  size: number;
  textChars: number;
  uploadedAt: Date;
  parsedFrom: 'deterministic' | 'llm';
}

/** Stored profile: shared `Profile` fields plus hashes, resume metadata and the worker's embedding. */
export type ProfileFields = Required<Omit<ProfileInput, 'workAuth'>> & {
  workAuth: { citizenship: string[]; authorisedCountries: string[]; needsSponsorship: boolean };
};

export interface ProfileDoc extends ProfileFields {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  profileHash: string | null;
  embeddingHash: string | null;
  embedding: number[];
  embeddedAt: Date | null;
  resume: ResumeMeta | null;
  resumeText: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const mixed = Schema.Types.Mixed;

const profileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, unique: true, ref: 'User' },
    headline: { type: String, default: null },
    summary: { type: String, default: null },
    // Sub-documents are validated by zod before they reach Mongo, so they are stored as Mixed
    // arrays (no per-item ObjectIds, exact round-trip of the shared shape).
    skills: { type: [mixed], default: [] },
    education: { type: [mixed], default: [] },
    experience: { type: [mixed], default: [] },
    experienceYears: { type: Number, default: 0 },
    projects: { type: [mixed], default: [] },
    links: { type: [mixed], default: [] },
    preferredRoles: { type: [String], default: [] },
    preferredLocations: { type: [String], default: [] },
    remotePref: { type: String, default: 'any' },
    openToRelocate: { type: Boolean, default: false },
    stipendFloor: { type: mixed, default: null },
    workAuth: {
      type: mixed,
      default: () => ({ citizenship: [], authorisedCountries: [], needsSponsorship: false }),
    },
    languages: { type: [mixed], default: [] },
    opportunityTypes: { type: [String], default: [] },
    profileHash: { type: String, default: null },
    embeddingHash: { type: String, default: null },
    embedding: { type: [Number], default: [] },
    embeddedAt: { type: Date, default: null },
    resume: { type: mixed, default: null },
    resumeText: { type: String, default: null },
  },
  { timestamps: true, collection: 'profiles', minimize: false },
);

export const Profile: Model<ProfileDoc> =
  (mongoose.models['Profile'] as Model<ProfileDoc> | undefined) ?? model<ProfileDoc>('Profile', profileSchema as unknown as Schema<ProfileDoc>);
