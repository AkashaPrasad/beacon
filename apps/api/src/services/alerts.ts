/**
 * Alert rule preview ("would have matched N in the last 7 days"). The condition test mirrors
 * the worker's `matchesConditions` (apps/worker/src/lib/alerts.ts) so the preview agrees with
 * what the notify pipeline will actually send.
 */
import type { Types } from 'mongoose';

import {
  DAY_MS,
  normaliseLocation,
  type AlertConditions,
  type OpportunityType,
  type RemoteMode,
} from '@kestrel/shared';

import { Match } from '../models/activity.js';
import type { ListingDoc } from '../models/listing.js';

export interface AlertCandidate {
  type: OpportunityType;
  title: string;
  company: string;
  location: readonly string[];
  remote: RemoteMode;
  country: string | null;
  deadlineAt: Date | null;
  skillsRequired: readonly string[];
  skillsNice: readonly string[];
}

export function matchesConditions(c: AlertConditions, listing: AlertCandidate, score: number, now: Date): boolean {
  if (score < c.minFit) return false;
  if (c.types.length > 0 && !c.types.includes(listing.type)) return false;
  if (c.maxDeadlineDays !== null) {
    if (!listing.deadlineAt) return false;
    const days = (new Date(listing.deadlineAt).getTime() - now.getTime()) / DAY_MS;
    if (days < 0 || days > c.maxDeadlineDays) return false;
  }
  if (c.remote !== 'any' && listing.remote !== c.remote) return false;
  if (c.locations.length > 0) {
    const places = listing.location.map((l) => normaliseLocation(l));
    const ok = c.locations.some((want) => {
      const w = normaliseLocation(want);
      const needle = want.trim().toLowerCase();
      return (
        places.some(
          (p) =>
            (w.city !== null && p.city === w.city) ||
            (w.city === null && w.country !== null && (p.country ?? listing.country) === w.country) ||
            p.raw.toLowerCase().includes(needle),
        ) ||
        (listing.remote === 'remote' && /remote|anywhere/i.test(needle))
      );
    });
    if (!ok) return false;
  }
  if (c.keywords.length > 0) {
    const hay = [listing.title, listing.company, ...listing.skillsRequired, ...listing.skillsNice].join(' ').toLowerCase();
    if (!c.keywords.every((k) => hay.includes(k.toLowerCase()))) return false;
  }
  return true;
}

export interface AlertPreview {
  matchesLast7d: number;
  /** Matches per day, oldest first (index 6 = the last 24 h). */
  matchesByDay: number[];
  sample: { listingId: string; title: string; company: string; score: number; firstSeenAt: Date }[];
  /** True when the user has no scored matches yet, so the preview cannot count anything. */
  warmingUp: boolean;
}

const PREVIEW_DAYS = 7;
const PREVIEW_SCAN_LIMIT = 5_000;

export async function previewAlert(userId: Types.ObjectId, conditions: AlertConditions, now: Date): Promise<AlertPreview> {
  const since = new Date(now.getTime() - PREVIEW_DAYS * DAY_MS);
  const rows = await Match.aggregate<{ score: number; listing: ListingDoc }>([
    { $match: { userId, score: { $gte: conditions.minFit } } },
    { $lookup: { from: 'listings', localField: 'listingId', foreignField: '_id', as: 'listing' } },
    { $unwind: '$listing' },
    { $match: { 'listing.archived': { $ne: true }, 'listing.firstSeenAt': { $gte: since } } },
    { $sort: { score: -1 } },
    { $limit: PREVIEW_SCAN_LIMIT },
    { $project: { 'listing.embedding': 0, 'listing.descriptionMd': 0, components: 0, contributions: 0, details: 0 } },
  ]);
  const matchesByDay = Array.from({ length: PREVIEW_DAYS }, () => 0);
  const sample: AlertPreview['sample'] = [];
  let total = 0;
  for (const { score, listing } of rows) {
    const candidate: AlertCandidate = {
      type: listing.type,
      title: listing.title,
      company: listing.company,
      location: listing.location ?? [],
      remote: listing.remote ?? 'unknown',
      country: listing.country ?? null,
      deadlineAt: listing.deadlineAt ?? null,
      skillsRequired: listing.skillsRequired ?? [],
      skillsNice: listing.skillsNice ?? [],
    };
    if (!matchesConditions(conditions, candidate, score, now)) continue;
    total += 1;
    const ageDays = Math.floor((now.getTime() - new Date(listing.firstSeenAt).getTime()) / DAY_MS);
    const bucket = PREVIEW_DAYS - 1 - Math.min(PREVIEW_DAYS - 1, Math.max(0, ageDays));
    matchesByDay[bucket] = (matchesByDay[bucket] ?? 0) + 1;
    if (sample.length < 5) {
      sample.push({
        listingId: listing._id.toString(),
        title: listing.title,
        company: listing.company,
        score: Math.round(score),
        firstSeenAt: listing.firstSeenAt,
      });
    }
  }
  const warmingUp = total === 0 && !(await Match.exists({ userId }));
  return { matchesLast7d: total, matchesByDay, sample, warmingUp };
}
