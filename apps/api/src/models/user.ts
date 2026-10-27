import mongoose, { model, Schema, type Model, type Types } from 'mongoose';

export const ONBOARDING_STEPS = ['consent', 'resume', 'preferences', 'sources', 'done'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
export const AI_MODES = ['beacon', 'byok', 'off'] as const;
export type AiMode = (typeof AI_MODES)[number];

export interface UserConsent {
  version: string;
  aiMode: AiMode;
  resumeToAi: boolean;
  at: Date;
}

export interface UserDoc {
  _id: Types.ObjectId;
  email: string;
  name: string;
  avatarUrl: string | null;
  /** Google account id; null for email + password accounts that never used Google. */
  googleSub: string | null;
  /** bcrypt hash; null for Google-only accounts. Never serialised. */
  passwordHash: string | null;
  passwordSetAt: Date | null;
  role: 'user' | 'admin';
  onboardingStep: OnboardingStep;
  onboardingCompletedAt: Date | null;
  lastLoginAt: Date | null;
  lastSeenFeedAt: Date | null;
  consent: UserConsent | null;
  sessionVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const consentSchema = new Schema(
  {
    version: { type: String, required: true },
    aiMode: { type: String, enum: AI_MODES, required: true },
    resumeToAi: { type: Boolean, required: true },
    at: { type: Date, required: true },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    avatarUrl: { type: String, default: null },
    googleSub: { type: String, default: null },
    passwordHash: { type: String, default: null },
    passwordSetAt: { type: Date, default: null },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    onboardingStep: { type: String, enum: ONBOARDING_STEPS, default: 'consent' },
    onboardingCompletedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    lastSeenFeedAt: { type: Date, default: null },
    consent: { type: consentSchema, default: null },
    sessionVersion: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'users' },
);

userSchema.index({ email: 1 });
// Partial so email + password accounts (googleSub null) do not collide on null.
userSchema.index(
  { googleSub: 1 },
  { name: 'googleSub_partial_unique', unique: true, partialFilterExpression: { googleSub: { $type: 'string' } } },
);
// At most one account per email can hold a password (login looks it up by email).
userSchema.index(
  { email: 1 },
  { name: 'email_password_unique', unique: true, partialFilterExpression: { passwordHash: { $type: 'string' } } },
);

export const User: Model<UserDoc> = (mongoose.models['User'] as Model<UserDoc> | undefined) ?? model<UserDoc>('User', userSchema as unknown as Schema<UserDoc>);
