import type { Types } from 'mongoose';

import { DEFAULT_WEIGHTS } from '@kestrel/shared';

import { Settings, type SettingsDoc } from '../models/settings.js';

/** Load the user's settings, creating the defaults on first access. */
export async function getSettings(userId: Types.ObjectId): Promise<SettingsDoc> {
  const doc = await Settings.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, weights: { ...DEFAULT_WEIGHTS } } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  ).lean<SettingsDoc>();
  if (!doc) throw new Error('settings upsert returned nothing');
  return doc;
}
