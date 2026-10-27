import { profileInputSchema, type ProfileInput } from '@kestrel/shared';
import type { Types } from 'mongoose';
import type { z } from 'zod';

import type { AppContext } from '../context.js';
import { sha256Hex, stableStringify } from '../lib/crypto.js';
import { Profile, type ProfileDoc, type ResumeMeta } from '../models/profile.js';

export type ParsedProfile = z.output<typeof profileInputSchema>;

export const PROFILE_FIELDS = Object.keys(profileInputSchema.shape) as (keyof ParsedProfile)[];

/** sha256 over the editable profile fields (stable key order); bumps whenever the profile changes. */
export function computeProfileHash(profile: ParsedProfile): string {
  const picked = Object.fromEntries(PROFILE_FIELDS.map((k) => [k, profile[k]]));
  return sha256Hex(stableStringify(picked));
}

/** Stored profile → the editable `ProfileInput` shape (defaults applied). */
export function pickProfileFields(doc: Partial<ProfileDoc> | null): ParsedProfile {
  const raw = doc ? Object.fromEntries(PROFILE_FIELDS.map((k) => [k, doc[k as keyof ProfileDoc]])) : {};
  // Drop unset values so zod defaults apply; nullable fields keep their explicit null.
  const cleaned = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined && v !== null));
  const parsed = profileInputSchema.safeParse(cleaned);
  return parsed.success ? parsed.data : profileInputSchema.parse({});
}

export function toProfileResponse(userId: Types.ObjectId, doc: ProfileDoc | null) {
  const fields = pickProfileFields(doc);
  return {
    profile: {
      userId: userId.toString(),
      ...fields,
      embeddingHash: doc?.embeddingHash ?? null,
      ...(doc?.updatedAt ? { updatedAt: doc.updatedAt } : {}),
    },
    exists: Boolean(doc),
    profileHash: doc?.profileHash ?? null,
    resume: doc?.resume ?? null,
  };
}

export interface SaveProfileExtras {
  resume?: ResumeMeta;
  resumeText?: string;
}

/**
 * Persist the profile. When the content hash changes, enqueue `embed` + `match` for the worker.
 */
export async function saveProfile(
  ctx: AppContext,
  userId: Types.ObjectId,
  input: ProfileInput | ParsedProfile,
  extras: SaveProfileExtras = {},
): Promise<{ doc: ProfileDoc; changed: boolean }> {
  const fields = profileInputSchema.parse(input);
  const profileHash = computeProfileHash(fields);
  const previous = await Profile.findOne({ userId }, { profileHash: 1 }).lean<Pick<ProfileDoc, 'profileHash'>>();
  const doc = await Profile.findOneAndUpdate(
    { userId },
    { $set: { ...fields, profileHash, ...extras }, $setOnInsert: { userId } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  ).lean<ProfileDoc>();
  if (!doc) throw new Error('profile upsert returned nothing');
  const changed = previous?.profileHash !== profileHash;
  if (changed) {
    const uid = userId.toString();
    await Promise.all([
      ctx.queue.add('embed', { kind: 'profile', userId: uid }, { dedupId: `embed:profile:${uid}` }),
      ctx.queue.add('match', { userId: uid, reason: 'profile' }, { dedupId: `match:${uid}` }),
    ]);
  }
  return { doc, changed };
}
