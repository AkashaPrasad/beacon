import { type ApplyUrlCheck, DAY_MS, ghostRisk } from '@kestrel/shared';
import { Types } from 'mongoose';

import { USER_AGENT } from '../lib/http.js';
import { type ListingDoc, ListingModel } from '../models/index.js';

import type { PipelineDeps } from './deps.js';

const CHECK_TIMEOUT_MS = 10_000;
/** Re-match when the ghost score moves this much (it feeds the fit penalty). */
const RESCORE_DELTA = 10;

const segments = (u: URL) => u.pathname.split('/').filter(Boolean);

/**
 * Did the apply link land on a home/careers index instead of the posting?
 * (Closed Greenhouse jobs redirect to the board root with `?error=true`, many careers
 * sites bounce to `/` or `/careers`.)
 */
export function redirectedToHome(original: string, final: string): boolean {
  let a: URL;
  let b: URL;
  try {
    a = new URL(original);
    b = new URL(final);
  } catch {
    return false;
  }
  if (a.toString() === b.toString()) return false;
  const before = segments(a);
  const after = segments(b);
  if (after.length === 0) return before.length > 0;
  if (b.searchParams.get('error') === 'true') return true;
  const indexLike = /^(careers?|jobs?|openings|positions|join(-us)?|work-with-us|en|en-us|en-in)$/i;
  return after.length < before.length && after.every((s) => indexLike.test(s) || before.includes(s)) && after.length <= 2;
}

/** HEAD (falling back to GET when HEAD is refused), following redirects, 10 s. */
export async function checkApplyUrl(url: string): Promise<ApplyUrlCheck> {
  const attempt = async (method: 'HEAD' | 'GET') => {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*;q=0.5' },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    await res.body?.cancel().catch(() => undefined);
    return res;
  };
  try {
    let res = await attempt('HEAD');
    if (res.status === 405 || res.status === 403 || res.status === 501 || res.status === 400) res = await attempt('GET');
    const finalUrl = res.url || url;
    return { status: res.status, finalUrl, redirectedToHome: redirectedToHome(url, finalUrl), error: null };
  } catch (err) {
    return { status: null, finalUrl: null, redirectedToHome: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface GhostcheckOutcome {
  listingId: string;
  score: number | null;
  previous: number | null;
  check: ApplyUrlCheck | null;
}

/**
 * Ghost/stale risk (SPEC §3.1 G): apply-link health, re-post count, age, boilerplate and
 * identical open roles at the company → shared `ghostRisk` score + reasons.
 */
export async function ghostcheckListing(
  deps: PipelineDeps,
  listingId: string,
  checker: (url: string) => Promise<ApplyUrlCheck> = checkApplyUrl,
): Promise<GhostcheckOutcome> {
  const l = await ListingModel.findById(listingId, { embedding: 0 }).lean<ListingDoc>();
  if (!l || l.archived) return { listingId, score: null, previous: null, check: null };
  const now = deps.now();
  const check = await checker(l.applyUrl);
  // canonicalKey = company|title|location → same company+title in other locations.
  const prefix = l.canonicalKey.split('|').slice(0, 2).join('|');
  const sameTitle = await ListingModel.countDocuments({ canonicalKey: { $regex: `^${escapeRegex(prefix)}\\|` }, archived: false });
  const identicalOpenRoles = Math.max(l.identicalOpenRoles ?? 0, sameTitle);
  const risk = ghostRisk(
    { postedAt: l.postedAt, firstSeenAt: l.firstSeenAt, lastSeenAt: l.lastSeenAt, title: l.title, descriptionMd: l.descriptionMd },
    { now, repostCount: l.repostCount ?? 0, applyUrlCheck: check, identicalOpenRoles },
  );
  await ListingModel.updateOne(
    { _id: new Types.ObjectId(listingId) },
    {
      $set: {
        ghostRisk: risk,
        applyUrlCheck: { status: check.status, finalUrl: check.finalUrl ?? null, redirectedToHome: Boolean(check.redirectedToHome), error: check.error ?? null, checkedAt: now },
        lastGhostCheckAt: now,
      },
    },
  );
  const previous = l.ghostRisk?.score ?? 0;
  if (Math.abs(risk.score - previous) >= RESCORE_DELTA) await deps.enqueue.match({ listingIds: [listingId] });
  deps.metrics.inc('beacon_worker_ghostchecks_total', { dead: String(check.status === 404 || check.status === 410) }, 1, 'Apply-link checks');
  return { listingId, score: risk.score, previous, check };
}

/** Weekly re-check: listings not checked in 7 days (oldest first, capped). */
export async function ghostRecheck(deps: PipelineDeps, limit = 2_000): Promise<number> {
  const cutoff = new Date(deps.now().getTime() - 7 * DAY_MS);
  const due = await ListingModel.find({ archived: false, $or: [{ lastGhostCheckAt: null }, { lastGhostCheckAt: { $lt: cutoff } }] }, { _id: 1 })
    .sort({ lastGhostCheckAt: 1 })
    .limit(limit)
    .lean();
  await deps.enqueue.ghostcheck(due.map((d) => String(d._id)));
  return due.length;
}
