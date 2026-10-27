import { type AlertConditions, DAY_MS, normaliseLocation, type OpportunityType, type RemoteMode } from '@kestrel/shared';

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

/** Does a scored listing satisfy an alert rule's conditions? (SPEC §3.1 E rules builder.) */
export function matchesConditions(c: AlertConditions, listing: AlertCandidate, score: number, now: Date): boolean {
  if (score < c.minFit) return false;
  if (c.types.length > 0 && !c.types.includes(listing.type)) return false;
  if (c.maxDeadlineDays !== null) {
    if (!listing.deadlineAt) return false;
    const days = (listing.deadlineAt.getTime() - now.getTime()) / DAY_MS;
    if (days < 0 || days > c.maxDeadlineDays) return false;
  }
  if (c.remote !== 'any' && listing.remote !== c.remote) return false;
  if (c.locations.length > 0) {
    const places = listing.location.map((l) => normaliseLocation(l));
    const ok = c.locations.some((want) => {
      const w = normaliseLocation(want);
      const needle = want.trim().toLowerCase();
      return places.some(
        (p) =>
          (w.city !== null && p.city === w.city) ||
          (w.city === null && w.country !== null && (p.country ?? listing.country) === w.country) ||
          p.raw.toLowerCase().includes(needle),
      ) || (listing.remote === 'remote' && /remote|anywhere/i.test(needle));
    });
    if (!ok) return false;
  }
  if (c.keywords.length > 0) {
    const hay = [listing.title, listing.company, ...listing.skillsRequired, ...listing.skillsNice].join(' ').toLowerCase();
    if (!c.keywords.every((k) => hay.includes(k.toLowerCase()))) return false;
  }
  return true;
}
