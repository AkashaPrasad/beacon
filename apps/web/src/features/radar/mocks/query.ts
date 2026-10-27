/**
 * Server-side semantics of `GET /v1/feed`, `/v1/feed/summary`, `/v1/listings/:id` and
 * `/explain` (docs/API.md §6), implemented over the in-memory fixtures for MSW. Kept separate
 * from the handlers so the filtering rules are plain functions.
 */
import { decodeCursor, encodeCursor, OPPORTUNITY_TYPES, type OpportunityType } from '@kestrel/shared';

import { getStore, warmingProgress, type MockEntry } from './fixtures';

const DAY = 86_400_000;

function csv(value: string | null): string[] {
  return value ? value.split(',').map((v) => v.trim()).filter(Boolean) : [];
}

function monthlyInr(entry: MockEntry): number | null {
  const { stipendMax, stipendMin, currency, period } = entry.listing;
  const amount = stipendMax ?? stipendMin;
  if (amount == null || currency !== 'INR') return null;
  switch (period) {
    case 'month':
      return amount;
    case 'year':
      return amount / 12;
    case 'week':
      return amount * 4.33;
    case 'day':
      return amount * 22;
    case 'hour':
      return amount * 176;
    case 'total':
    case null:
      return null;
    default:
      return null;
  }
}

function matchesQuery(entry: MockEntry, q: string): boolean {
  const haystack = [
    entry.listing.title,
    entry.listing.company,
    ...entry.listing.skillsRequired,
    ...entry.listing.skillsNice,
    ...entry.listing.location,
  ]
    .join(' ')
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

export interface FeedPage {
  items: FeedItemJson[];
  nextCursor: string | null;
  warmingUp: boolean;
  total?: number;
}

export interface FeedItemJson {
  listing: MockEntry['listing'];
  fit: MockEntry['fit'] | null;
  score: number | null;
  saved: boolean;
  hidden: boolean;
  trackerItemId: string | null;
}

function toItem(entry: MockEntry, warmingUp: boolean): FeedItemJson {
  return {
    listing: { ...entry.listing, descriptionMd: entry.listing.descriptionMd.slice(0, 500) },
    fit: warmingUp ? null : entry.fit,
    score: warmingUp ? null : entry.fit.score,
    saved: entry.saved,
    hidden: entry.hidden,
    trackerItemId: entry.trackerItemId,
  };
}

/** Entries visible under `params`, sorted, before pagination. */
export function filterEntries(params: URLSearchParams): { entries: MockEntry[]; warmingUp: boolean } {
  const store = getStore();
  const now = Date.now();
  const progress = warmingProgress(store);
  const warmingUp = progress < 1;
  let entries = store.order.map((id) => store.entries.get(id)!).filter(Boolean);
  if (warmingUp) {
    // Rows stream in as each pack finishes: only part of the index is visible yet.
    entries = entries.slice(0, Math.max(4, Math.floor(entries.length * progress)));
  }

  const q = params.get('q')?.trim() ?? '';
  const types = csv(params.get('types')).filter((t): t is OpportunityType =>
    (OPPORTUNITY_TYPES as readonly string[]).includes(t),
  );
  const remote = csv(params.get('remote'));
  const locations = csv(params.get('locations')).map((l) => l.toLowerCase());
  const companies = csv(params.get('companies') ?? params.get('company')).map((c) => c.toLowerCase());
  const sourceIds = csv(params.get('sourceIds') ?? params.get('sourceId'));
  const deadlineWithin = Number(params.get('deadlineWithinDays')) || null;
  const postedWithin = Number(params.get('postedWithinDays')) || null;
  const minStipend = Number(params.get('minStipend')) || null;
  const gradYear = Number(params.get('gradYear')) || null;
  const minFit = Number(params.get('minFit')) || 0;
  const savedOnly = params.get('savedOnly') === 'true' || params.get('savedOnly') === '1';
  const includeHidden =
    params.get('includeHidden') === 'true' || params.get('hideHidden') === 'false';
  const includeExpired = params.get('includeExpired') === 'true';
  const sort = params.get('sort') ?? 'fit';

  const out = entries.filter((e) => {
    const l = e.listing;
    if (!includeHidden && e.hidden) return false;
    if (!includeExpired && l.deadlineAt && l.deadlineAt.getTime() < now) return false;
    if (q && !matchesQuery(e, q)) return false;
    if (types.length && !types.includes(l.type)) return false;
    if (remote.length && !remote.includes(l.remote)) return false;
    if (locations.length && !l.location.some((loc) => locations.some((want) => loc.toLowerCase().includes(want))))
      return false;
    if (companies.length && !companies.some((c) => l.company.toLowerCase().includes(c))) return false;
    if (sourceIds.length && !sourceIds.includes(l.sourceId)) return false;
    if (deadlineWithin != null) {
      if (!l.deadlineAt) return false;
      if (l.deadlineAt.getTime() > now + deadlineWithin * DAY) return false;
    }
    if (postedWithin != null) {
      const posted = (l.postedAt ?? l.firstSeenAt).getTime();
      if (posted < now - postedWithin * DAY) return false;
    }
    if (minStipend != null) {
      const monthly = monthlyInr(e);
      if (monthly == null || monthly < minStipend) return false;
    }
    if (gradYear != null && l.eligibility.gradYears.length && !l.eligibility.gradYears.includes(gradYear))
      return false;
    if (savedOnly && !e.saved) return false;
    // minFit is ignored on the cold-start path (docs/API.md §6).
    if (!warmingUp && e.fit.score < minFit) return false;
    return true;
  });

  const deadlineOf = (e: MockEntry) => e.listing.deadlineAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const postedOf = (e: MockEntry) => (e.listing.postedAt ?? e.listing.firstSeenAt).getTime();
  if (warmingUp || sort === 'posted') out.sort((a, b) => postedOf(b) - postedOf(a) || a.listing.id.localeCompare(b.listing.id));
  else if (sort === 'deadline') out.sort((a, b) => deadlineOf(a) - deadlineOf(b) || b.fit.score - a.fit.score);
  else out.sort((a, b) => b.fit.score - a.fit.score || a.listing.id.localeCompare(b.listing.id));
  return { entries: out, warmingUp };
}

export function queryFeed(params: URLSearchParams): FeedPage | { error: 'BAD_CURSOR' } {
  const limit = Math.min(100, Math.max(1, Number(params.get('limit')) || 20));
  const cursor = params.get('cursor');
  let offset = 0;
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (!decoded || typeof decoded.o !== 'number') return { error: 'BAD_CURSOR' };
    offset = decoded.o;
  }
  const { entries, warmingUp } = filterEntries(params);
  const slice = entries.slice(offset, offset + limit);
  const nextOffset = offset + slice.length;
  return {
    items: slice.map((e) => toItem(e, warmingUp)),
    nextCursor: nextOffset < entries.length ? encodeCursor({ o: nextOffset, k: params.get('sort') ?? 'fit' }) : null,
    warmingUp,
    ...(cursor ? {} : { total: entries.length }),
  };
}

export function feedSummary() {
  const store = getStore();
  const now = Date.now();
  const progress = warmingProgress(store);
  const all = [...store.entries.values()].filter((e) => !e.hidden);
  const open = all.filter((e) => !e.listing.deadlineAt || e.listing.deadlineAt.getTime() >= now);
  const byType = Object.fromEntries(OPPORTUNITY_TYPES.map((t) => [t, 0])) as Record<OpportunityType, number>;
  for (const e of open) byType[e.listing.type] += 1;
  const returning = store.scenario !== 'warming' && store.scenario !== 'empty';
  return {
    total: progress < 1 ? Math.floor(open.length * progress) : open.length,
    byType,
    deadlinesThisWeek: open.filter(
      (e) => e.listing.deadlineAt && e.listing.deadlineAt.getTime() <= now + 7 * DAY && (e.saved || e.fit.score >= 40),
    ).length,
    newSinceLastVisit: returning
      ? open.filter((e) => e.listing.firstSeenAt.getTime() > store.lastSeenFeedAt && e.fit.score >= 40).length
      : 0,
    lastSeenFeedAt: returning ? new Date(store.lastSeenFeedAt).toISOString() : null,
    saved: all.filter((e) => e.saved).length,
    warmingUp: progress < 1,
    // Mock-only extras used by the warming-up strip (additive; see SHARED-REQUESTS "web → api").
    progress: { done: Math.round(progress * 7), total: 7 },
  };
}

export function markSeen(): void {
  getStore().lastSeenFeedAt = Date.now();
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

/** Tiny Markdown → HTML for fixtures (the real API sanitises server-side). */
export function markdownToHtml(md: string): string {
  const lines = md.split('\n');
  const html: string[] = [];
  let inList = false;
  const inline = (text: string) =>
    escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('- ')) {
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${inline(line.slice(2))}</li>`);
      continue;
    }
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
    if (!line) continue;
    if (line.startsWith('## ')) html.push(`<h3>${inline(line.slice(3))}</h3>`);
    else if (line.startsWith('# ')) html.push(`<h2>${inline(line.slice(2))}</h2>`);
    else html.push(`<p>${inline(line)}</p>`);
  }
  if (inList) html.push('</ul>');
  return html.join('');
}

export function listingDetail(id: string) {
  const store = getStore();
  const entry = store.entries.get(id);
  if (!entry) return null;
  const { fit, listing } = entry;
  const long = `${listing.descriptionMd}\n\n## How to apply\nApply through the link below. Shortlisted candidates hear back within two weeks.\n\n## About ${listing.company}\n${listing.company} is a fictional organisation used for Beacon's demo data. Teams are small, reviews are kind, and interns ship to production in their first month.\n\n## Benefits\n- Mentorship from a senior engineer\n- Flexible hours\n- Certificate and letter of recommendation`;
  const similar = [...store.entries.values()]
    .filter((e) => e.listing.id !== id && e.listing.type === listing.type && !e.hidden)
    .sort((a, b) => b.fit.score - a.fit.score)
    .slice(0, 6)
    .map((e) => ({ listing: { ...e.listing, descriptionMd: '' }, score: e.fit.score }));
  const ghost = listing.ghostRisk.score;
  return {
    listing,
    descriptionHtml: markdownToHtml(long),
    fit,
    matchedSkills: [...fit.details.skills.matchedRequired, ...fit.details.skills.matchedNice],
    missingSkills: [...fit.details.skills.missingRequired, ...fit.details.skills.missingNice],
    saved: entry.saved,
    hidden: entry.hidden,
    trackerItemId: entry.trackerItemId,
    source: entry.source,
    applyLinkHealth:
      ghost >= 60
        ? {
            status: 'redirect_home' as const,
            httpStatus: 302,
            checkedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
            reasons: listing.ghostRisk.reasons,
          }
        : {
            status: 'ok' as const,
            httpStatus: 200,
            checkedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
            reasons: [],
          },
    similar,
  };
}

export function explanation(id: string, aiOff: boolean) {
  const entry = getStore().entries.get(id);
  if (!entry) return null;
  const { fit } = entry;
  const missing = fit.details.skills.missingRequired;
  const tips = aiOff
    ? missing.slice(0, 3).map((skill) => `Add a project or course that shows ${skill}.`)
    : [
        `Lead your resume with the project closest to ${entry.listing.title.toLowerCase()}.`,
        missing[0]
          ? `Name ${missing[0]} explicitly if you have used it, even briefly.`
          : 'Quantify impact on your strongest project (users, latency, revenue).',
        `Mirror the wording of the listing's "You have" section in your skills line.`,
      ];
  return {
    listingId: id,
    profileHash: 'mock-profile-hash',
    source: aiOff ? ('deterministic' as const) : ('llm' as const),
    whyFit: fit.explain.whyFit.slice(0, 3),
    gaps: fit.explain.gaps.slice(0, 2),
    tailoringTips: tips,
    generatedAt: new Date().toISOString(),
  };
}

export function setFlag(id: string, flag: 'saved' | 'hidden', value: boolean) {
  const entry = getStore().entries.get(id);
  if (!entry) return null;
  entry[flag] = value;
  return { listingId: id, saved: entry.saved, hidden: entry.hidden };
}

export function setTracked(id: string, trackerItemId: string | null) {
  const entry = getStore().entries.get(id);
  if (entry) entry.trackerItemId = trackerItemId;
  return entry ?? null;
}
