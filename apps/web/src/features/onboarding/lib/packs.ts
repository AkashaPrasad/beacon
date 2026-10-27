/** Step 3 (Sources) rules: canonical pack ids and which packs are pre-selected (USERFLOW §1.6). */
import type { OpportunityType, RemotePref } from '@kestrel/shared';

/** Seed-file aliases the API also accepts (API.md §5). */
const PACK_ALIASES: Record<string, string> = {
  'india-product': 'top-indian-product',
  'faang-india': 'faang-plus-india',
  'yc-startups': 'yc-startups-interns',
  hackathons: 'hackathons-india',
  scholarships: 'scholarships-engineering',
  'remote-friendly': 'remote-friendly-startups',
};

export function canonicalPackId(id: string): string {
  return PACK_ALIASES[id] ?? id;
}

/** Display order (USERFLOW §1.6 table); unknown packs follow in API order. */
export const PACK_ORDER = [
  'top-indian-product',
  'faang-plus-india',
  'yc-startups-interns',
  'hackathons-india',
  'scholarships-engineering',
  'remote-friendly-startups',
  'opensource-programs',
] as const;

/** One-line "why this pack" shown under each name. */
export const PACK_BLURBS: Record<string, string> = {
  'top-indian-product': 'Razorpay, CRED, Zerodha and other product companies',
  'faang-plus-india': 'Global tech companies with teams in India',
  'yc-startups-interns': 'Early-stage startups that hire interns',
  'hackathons-india': 'Devpost, MLH, Devfolio and more',
  'scholarships-engineering': 'National and private scholarships, fellowships',
  'remote-friendly-startups': 'Teams that hire remote-first',
  'opensource-programs': 'GSoC, LFX, MLH Fellowship, Outreachy',
};

export function sortPacks<T extends { id: string }>(packs: readonly T[]): T[] {
  const rank = (id: string) => {
    const i = (PACK_ORDER as readonly string[]).indexOf(canonicalPackId(id));
    return i === -1 ? PACK_ORDER.length : i;
  };
  return [...packs].sort((a, b) => rank(a.id) - rank(b.id));
}

/** Packs pre-selected for the student's answers in step 2. */
export function preselectedPacks(
  types: readonly OpportunityType[],
  remotePref: RemotePref,
): Set<string> {
  const has = (...t: OpportunityType[]) => t.some((x) => types.includes(x));
  const on = new Set<string>();
  if (has('internship', 'fulltime')) {
    on.add('top-indian-product');
    on.add('faang-plus-india');
  }
  if (has('internship')) on.add('yc-startups-interns');
  if (has('hackathon')) on.add('hackathons-india');
  if (has('scholarship', 'fellowship')) on.add('scholarships-engineering');
  if (remotePref === 'remote_only' || remotePref === 'prefer_remote') on.add('remote-friendly-startups');
  if (has('opensource', 'research')) on.add('opensource-programs');
  return on;
}
