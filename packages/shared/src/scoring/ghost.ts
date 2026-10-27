import { DAY_MS, GHOST_RULES } from '../constants';
import type { GhostReason, GhostRisk } from '../schemas/listing';

export interface ApplyUrlCheck {
  /** HTTP status of the apply URL (after redirects); null when the request failed. */
  status: number | null;
  finalUrl?: string | null;
  /** True when the apply URL redirected to the careers/home page instead of the job. */
  redirectedToHome?: boolean;
  error?: string | null;
}

export interface GhostRiskContext {
  now?: Date;
  /** How many times this role (same canonicalKey) was re-posted with a new date/URL. */
  repostCount?: number;
  /** Result of the ghostcheck HEAD/GET on the apply URL. */
  applyUrlCheck?: ApplyUrlCheck | null;
  /** Open listings at the same company with an identical normalised title. */
  identicalOpenRoles?: number;
}

export interface GhostRiskListing {
  postedAt?: Date | null;
  firstSeenAt?: Date | null;
  lastSeenAt?: Date | null;
  title?: string;
  descriptionMd?: string;
}

const BOILERPLATE = [
  /\balways (accepting|hiring|looking|open to)\b/i,
  /\b(talent|candidate) (pool|community|network|pipeline)\b/i,
  /\bgeneral (application|interest|applications)\b/i,
  /\bfuture (opportunities|openings|roles|positions|vacancies)\b/i,
  /\bevergreen\b/i,
  /\bexpression of interest\b/i,
  /\b(on the lookout|keep your (resume|cv) on file)\b/i,
];

const days = (ms: number) => Math.floor(ms / DAY_MS);

/**
 * Ghost/stale risk (SPEC §3.1 G) as a 0..100 score with reasons:
 * age > 45 d (+ more > 90 d), re-posted ≥ 3×, apply link 404/410 or redirect-to-home
 * (or failing), boilerplate "always accepting" copy, > 5 identical open roles, and
 * not seen in its source for 14 d.
 */
export function ghostRisk(listing: GhostRiskListing, context: GhostRiskContext = {}): GhostRisk {
  const now = context.now ?? new Date();
  const p = GHOST_RULES.points;
  const reasons: GhostReason[] = [];

  const posted = listing.postedAt ?? listing.firstSeenAt ?? null;
  if (posted) {
    const age = days(now.getTime() - posted.getTime());
    if (age > GHOST_RULES.maxAgeDays) {
      reasons.push({ code: 'age', message: `Posted ${age} days ago`, points: p.age });
    }
    if (age > GHOST_RULES.veryOldDays) {
      reasons.push({
        code: 'very_old',
        message: `Open for over ${GHOST_RULES.veryOldDays} days`,
        points: p.veryOld,
      });
    }
  }

  const reposts = context.repostCount ?? 0;
  if (reposts >= GHOST_RULES.repostThreshold) {
    reasons.push({ code: 'reposted', message: `Re-posted ${reposts} times`, points: p.reposted });
  }

  const check = context.applyUrlCheck;
  if (check) {
    if (check.status === 404 || check.status === 410) {
      reasons.push({
        code: 'apply_link_dead',
        message: `Apply link returns ${check.status}`,
        points: p.applyLinkDead,
      });
    } else if (check.redirectedToHome) {
      reasons.push({
        code: 'apply_link_redirect_home',
        message: 'Apply link redirects to the careers home page',
        points: p.applyLinkRedirectHome,
      });
    } else if (check.status === null || check.status >= 500 || check.error) {
      reasons.push({
        code: 'apply_link_error',
        message: 'Apply link failed to load',
        points: p.applyLinkError,
      });
    }
  }

  const text = `${listing.title ?? ''}\n${listing.descriptionMd ?? ''}`;
  if (BOILERPLATE.some((re) => re.test(text))) {
    reasons.push({
      code: 'boilerplate',
      message: 'Generic "always accepting applications" posting',
      points: p.boilerplate,
    });
  }

  const identical = context.identicalOpenRoles ?? 0;
  if (identical > GHOST_RULES.identicalRolesThreshold) {
    reasons.push({
      code: 'identical_roles',
      message: `${identical} identical open roles at this company`,
      points: p.identicalRoles,
    });
  }

  if (listing.lastSeenAt) {
    const unseen = days(now.getTime() - listing.lastSeenAt.getTime());
    if (unseen > GHOST_RULES.notSeenDays) {
      reasons.push({
        code: 'not_seen_recently',
        message: `Not seen in its source for ${unseen} days`,
        points: p.notSeenRecently,
      });
    }
  }

  const score = Math.min(
    100,
    reasons.reduce((sum, r) => sum + r.points, 0),
  );
  return { score, reasons: reasons.sort((a, b) => b.points - a.points) };
}
