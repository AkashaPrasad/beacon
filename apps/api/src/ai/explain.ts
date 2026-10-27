import type { FitResult } from '@kestrel/shared';
import type { Types } from 'mongoose';
import { z } from 'zod';

import type { AppContext } from '../context.js';
import { Explanation, type ExplanationDoc } from '../models/activity.js';
import type { ListingDoc } from '../models/listing.js';
import type { ProfileDoc } from '../models/profile.js';

import { generateStructured, llmForUser } from './llm.js';

export const explanationLlmSchema = z.object({
  whyFit: z.array(z.string().min(1).max(300)).max(5),
  gaps: z.array(z.string().min(1).max(300)).max(5),
  tailoringTips: z.array(z.string().min(1).max(300)).max(5),
});

export interface ExplanationDTO {
  listingId: string;
  profileHash: string | null;
  source: 'llm' | 'cache' | 'deterministic';
  whyFit: string[];
  gaps: string[];
  tailoringTips: string[];
  generatedAt: Date;
}

const SYSTEM = `You are a concise career advisor for students. Given a student profile and an
opportunity, output ONLY a JSON object:
{"whyFit": string[3], "gaps": string[2], "tailoringTips": string[2-3]}
Each item is one short sentence grounded in the provided data. No flattery, no emojis.`;

/** Tips derived from the deterministic fit (used when AI is off or unavailable). */
export function deterministicTips(fit: FitResult): string[] {
  const missing = [...fit.details.skills.missingRequired, ...fit.details.skills.missingNice];
  const tips = missing.slice(0, 2).map((skill) => `If you have used ${skill}, name it explicitly in your resume or a project.`);
  const matched = fit.details.skills.matchedRequired.slice(0, 2);
  if (matched.length) tips.push(`Lead with your ${matched.join(' and ')} work; it matches what they ask for.`);
  return tips.slice(0, 3);
}

function profileSummary(profile: ProfileDoc): string {
  const education = profile.education
    .map((e) => `${e.degree} at ${e.institution} (${e.gradYear})`)
    .join('; ');
  return [
    profile.headline ? `Headline: ${profile.headline}` : '',
    `Skills: ${profile.skills.map((s) => s.name).slice(0, 40).join(', ')}`,
    education ? `Education: ${education}` : '',
    `Experience: ${profile.experienceYears} years; roles: ${profile.experience.map((e) => e.title).slice(0, 5).join(', ')}`,
    profile.projects.length ? `Projects: ${profile.projects.map((p) => p.name).slice(0, 6).join(', ')}` : '',
    profile.preferredRoles.length ? `Preferred roles: ${profile.preferredRoles.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function listingSummary(listing: ListingDoc): string {
  return [
    `${listing.title} at ${listing.company} (${listing.type})`,
    `Location: ${listing.location.join(', ') || 'n/a'} (${listing.remote})`,
    `Required skills: ${listing.skillsRequired.join(', ') || 'n/a'}`,
    `Nice to have: ${listing.skillsNice.join(', ') || 'n/a'}`,
    `Description: ${listing.descriptionMd.slice(0, 4_000)}`,
  ].join('\n');
}

/** "Why fit / gaps / tailoring tips", cached per (user, listing, profileHash). */
export async function explainListing(
  ctx: AppContext,
  userId: Types.ObjectId,
  listing: ListingDoc,
  profile: ProfileDoc | null,
  fit: FitResult | null,
): Promise<ExplanationDTO> {
  const listingId = listing._id.toString();
  const profileHash = profile?.profileHash ?? null;
  const deterministic = (): ExplanationDTO => ({
    listingId,
    profileHash,
    source: 'deterministic',
    whyFit: fit?.explain.whyFit.slice(0, 3) ?? [],
    gaps: fit?.explain.gaps.slice(0, 2) ?? [],
    tailoringTips: fit ? deterministicTips(fit) : ['Complete your profile to get tailored tips.'],
    generatedAt: ctx.now(),
  });
  if (!profile || !profileHash) return deterministic();

  const cached = await Explanation.findOne({ userId, listingId: listing._id, profileHash }).lean<ExplanationDoc>();
  if (cached) {
    return {
      listingId,
      profileHash,
      source: 'cache',
      whyFit: cached.whyFit,
      gaps: cached.gaps,
      tailoringTips: cached.tailoringTips,
      generatedAt: cached.createdAt,
    };
  }

  const { resolved } = await llmForUser(ctx, userId, 'explain');
  if (!resolved.ok) return deterministic();

  const fitLine = fit
    ? `Deterministic fit score ${fit.score}/100. Matched skills: ${fit.details.skills.matchedRequired.join(', ') || 'none'}. Missing: ${fit.details.skills.missingRequired.join(', ') || 'none'}.`
    : '';
  const result = await generateStructured(ctx, {
    userId: userId.toString(),
    purpose: 'explain',
    schema: explanationLlmSchema,
    schemaName: 'fit_explanation',
    system: SYSTEM,
    prompt: `STUDENT\n${profileSummary(profile)}\n\nOPPORTUNITY\n${listingSummary(listing)}\n\n${fitLine}`,
    config: resolved.config,
  });
  if (!result.ok) return deterministic();

  const doc = {
    userId,
    listingId: listing._id,
    profileHash,
    whyFit: result.object.whyFit.slice(0, 3),
    gaps: result.object.gaps.slice(0, 2),
    tailoringTips: result.object.tailoringTips.slice(0, 3),
    model: result.config.model,
    source: 'llm' as const,
  };
  const saved = await Explanation.findOneAndUpdate(
    { userId, listingId: listing._id, profileHash },
    { $setOnInsert: doc },
    { upsert: true, returnDocument: 'after' },
  ).lean<ExplanationDoc>();
  return {
    listingId,
    profileHash,
    source: 'llm',
    whyFit: doc.whyFit,
    gaps: doc.gaps,
    tailoringTips: doc.tailoringTips,
    generatedAt: saved?.createdAt ?? ctx.now(),
  };
}
