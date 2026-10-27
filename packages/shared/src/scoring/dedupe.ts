import { tryNormaliseUrl } from '../normalise/url';
import type { Listing } from '../schemas/listing';

export interface DedupeCandidate {
  canonicalKey: string;
  applyUrl: string;
  seenCount?: number;
  firstSeenAt?: Date;
  lastSeenAt?: Date;
}

/** How much structured information a listing carries; the richest duplicate is kept. */
export function listingRichness(listing: Partial<Listing>): number {
  let score = 0;
  if (listing.deadlineAt) score += 2;
  if (listing.postedAt) score += 1;
  if (listing.stipendMin != null || listing.stipendMax != null) score += 2;
  if (listing.companyDomain) score += 1;
  if (listing.country) score += 1;
  if ((listing.location?.length ?? 0) > 0) score += 1;
  if (listing.remote && listing.remote !== 'unknown') score += 1;
  const e = listing.eligibility;
  if (e) {
    if (e.gradYears.length > 0) score += 1;
    if (e.degrees.length > 0) score += 1;
    if (e.citizenship.length > 0) score += 1;
    if (e.other.length > 0) score += 1;
    if (e.minExperienceYears !== null) score += 1;
  }
  if ((listing.skillsRequired?.length ?? 0) > 0) score += 2;
  if ((listing.skillsNice?.length ?? 0) > 0) score += 1;
  const desc = listing.descriptionMd?.length ?? 0;
  if (desc > 200) score += 1;
  if (desc > 1_000) score += 1;
  if (desc > 3_000) score += 1;
  if ((listing.embedding?.length ?? 0) > 0) score += 1;
  return score;
}

/**
 * Collapse duplicates that share a `canonicalKey` or a canonicalised apply URL
 * (transitively). Each group keeps its richest record (ties → first seen) with
 * `seenCount` summed and `firstSeenAt`/`lastSeenAt` widened. Order of first appearance.
 */
export function dedupeListings<T extends DedupeCandidate>(candidates: readonly T[]): T[] {
  const parent = candidates.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root] ?? root;
    let node = i;
    while (parent[node] !== root) {
      const next = parent[node] ?? root;
      parent[node] = root;
      node = next;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };

  const byKey = new Map<string, number>();
  const byUrl = new Map<string, number>();
  candidates.forEach((candidate, i) => {
    const key = candidate.canonicalKey;
    const seenKey = byKey.get(key);
    if (seenKey === undefined) byKey.set(key, i);
    else union(seenKey, i);
    const url = tryNormaliseUrl(candidate.applyUrl);
    if (url) {
      const seenUrl = byUrl.get(url);
      if (seenUrl === undefined) byUrl.set(url, i);
      else union(seenUrl, i);
    }
  });

  const groups = new Map<number, T[]>();
  candidates.forEach((candidate, i) => {
    const root = find(i);
    const group = groups.get(root);
    if (group) group.push(candidate);
    else groups.set(root, [candidate]);
  });

  const out: T[] = [];
  for (const group of groups.values()) {
    let richest = group[0] as T;
    let best = listingRichness(richest);
    for (const candidate of group.slice(1)) {
      const score = listingRichness(candidate);
      if (score > best) {
        richest = candidate;
        best = score;
      }
    }
    if (group.length === 1) {
      out.push(richest);
      continue;
    }
    const firsts = group.map((c) => c.firstSeenAt?.getTime()).filter((t) => t !== undefined);
    const lasts = group.map((c) => c.lastSeenAt?.getTime()).filter((t) => t !== undefined);
    const merged: T = {
      ...richest,
      seenCount: group.reduce((sum, c) => sum + (c.seenCount ?? 1), 0),
    };
    if (firsts.length > 0) merged.firstSeenAt = new Date(Math.min(...firsts));
    if (lasts.length > 0) merged.lastSeenAt = new Date(Math.max(...lasts));
    out.push(merged);
  }
  return out;
}
