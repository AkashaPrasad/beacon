import type { AiProvider, WeightsInput } from '@kestrel/shared';
import { model, models, Schema, type Model, type Types } from 'mongoose';

export interface SettingsDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  appearance: {
    theme: 'light' | 'dark' | 'system';
    accent: string;
    density: 'comfortable' | 'compact';
    fontSize: 'sm' | 'md' | 'lg';
    reducedMotion: 'system' | 'reduce' | 'no-preference';
  };
  ai: {
    provider: AiProvider;
    baseUrl: string | null;
    model: string | null;
    keyLast4: string | null;
    /** AES-256-GCM, base64(iv ‖ tag ‖ ciphertext); never returned by the API. */
    keyCiphertext: string | null;
    enabled: boolean;
    consentGivenAt: Date | null;
  };
  notifications: {
    push: boolean;
    inapp: boolean;
    deadlineReminders: number[];
    nudges: boolean;
    digestTime: string;
    quietHours: { start: string; end: string } | null;
    timezone: string;
  };
  privacy: { sendResumeToAi: boolean };
  weights: WeightsInput;
  createdAt: Date;
  updatedAt: Date;
}

const settingsSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, unique: true, ref: 'User' },
    appearance: {
      theme: { type: String, default: 'system' },
      accent: { type: String, default: 'default' },
      density: { type: String, default: 'comfortable' },
      fontSize: { type: String, default: 'md' },
      reducedMotion: { type: String, default: 'system' },
    },
    ai: {
      provider: { type: String, default: 'default' },
      baseUrl: { type: String, default: null },
      model: { type: String, default: null },
      keyLast4: { type: String, default: null },
      keyCiphertext: { type: String, default: null },
      enabled: { type: Boolean, default: true },
      consentGivenAt: { type: Date, default: null },
    },
    notifications: {
      push: { type: Boolean, default: true },
      inapp: { type: Boolean, default: true },
      deadlineReminders: { type: [Number], default: [7, 3, 1] },
      nudges: { type: Boolean, default: true },
      digestTime: { type: String, default: '09:00' },
      quietHours: { type: Schema.Types.Mixed, default: null },
      timezone: { type: String, default: 'Asia/Kolkata' },
    },
    privacy: { sendResumeToAi: { type: Boolean, default: false } },
    weights: { type: Schema.Types.Mixed },
  },
  { timestamps: true, collection: 'settings', minimize: false },
);

export const Settings: Model<SettingsDoc> =
  (models['Settings'] as Model<SettingsDoc> | undefined) ?? model<SettingsDoc>('Settings', settingsSchema as unknown as Schema<SettingsDoc>);
