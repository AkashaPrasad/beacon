/**
 * Sentence-builder model for alert rules (DESIGN §6.1 "Alerts rule builder").
 *
 *   When [fit ≥ 80] and [type is Internship, Hackathon] and [deadline ≤ 14 days]
 *   and [location: Remote, Bengaluru] and [keywords: go, rust] → notify me [push, in-app] [instantly]
 *
 * `RuleDraft` is the UI state (one field per bracket). `draftToInput` maps it to the shared
 * `alertRuleInputSchema` and returns field-level errors for inline validation; `ruleToDraft` is the
 * inverse for editing. Channels are web push and in-app only (BRIEF #1).
 */
import {
  ALERT_CADENCES,
  OPPORTUNITY_TYPE_LABELS,
  OPPORTUNITY_TYPES,
  alertRuleInputSchema,
  type AlertCadence,
  type AlertChannel,
  type AlertRule,
  type AlertRuleInput,
  type OpportunityType,
} from '@kestrel/shared';

export type RemoteFilter = 'any' | 'remote' | 'hybrid' | 'onsite';

/** Optional clauses that can be added with "+ condition" and removed with ×. */
export const OPTIONAL_CLAUSES = ['type', 'deadline', 'location', 'keywords'] as const;
export type OptionalClause = (typeof OPTIONAL_CLAUSES)[number];

export const CLAUSE_LABELS: Record<OptionalClause, string> = {
  type: 'Type',
  deadline: 'Deadline',
  location: 'Location',
  keywords: 'Keywords',
};

export interface RuleDraft {
  name: string;
  /** User typed a name; otherwise it follows the sentence. */
  nameTouched: boolean;
  enabled: boolean;
  minFit: number;
  /** Clauses currently shown in the sentence (order = insertion order). */
  clauses: OptionalClause[];
  types: OpportunityType[];
  deadlineDays: number;
  remote: RemoteFilter;
  locations: string[];
  keywords: string[];
  channels: AlertChannel[];
  cadence: AlertCadence;
  digestTime: string;
  digestDay: number;
}

export type DraftField =
  | 'name'
  | 'minFit'
  | 'types'
  | 'deadlineDays'
  | 'locations'
  | 'keywords'
  | 'channels'
  | 'cadence'
  | 'digestTime';

export type DraftErrors = Partial<Record<DraftField, string>>;

export const FIT_STEPS = [40, 50, 60, 70, 75, 80, 85, 90] as const;
export const DEADLINE_STEPS = [3, 7, 14, 30, 60] as const;
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const REMOTE_LABELS: Record<RemoteFilter, string> = {
  any: 'Anywhere',
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site',
};
export const CHANNEL_LABELS: Record<AlertChannel, string> = { push: 'Push', inapp: 'In-app' };
export const CADENCES: readonly AlertCadence[] = ALERT_CADENCES;

export function emptyDraft(): RuleDraft {
  return {
    name: '',
    nameTouched: false,
    enabled: true,
    minFit: 80,
    clauses: [],
    types: [],
    deadlineDays: 14,
    remote: 'any',
    locations: [],
    keywords: [],
    channels: ['inapp'],
    cadence: 'instant',
    digestTime: '08:00',
    digestDay: 1,
  };
}

/** USERFLOW §6 "Create this rule": notify me when a Strong fit internship opens. */
export function starterDraft(): RuleDraft {
  return {
    ...emptyDraft(),
    minFit: 80,
    clauses: ['type'],
    types: ['internship'],
    channels: ['push', 'inapp'],
  };
}

// ── Sentence text ──────────────────────────────────────────────────────────────────────────────

function joinOr(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1] ?? ''}`;
}

export function fitPhrase(d: Pick<RuleDraft, 'minFit'>): string {
  return `fit ≥ ${d.minFit}`;
}
export function typePhrase(d: Pick<RuleDraft, 'types'>): string {
  return d.types.length ? `type is ${joinOr(d.types.map((t) => OPPORTUNITY_TYPE_LABELS[t]))}` : 'any type';
}
export function deadlinePhrase(d: Pick<RuleDraft, 'deadlineDays'>): string {
  return `deadline ≤ ${d.deadlineDays} days`;
}
export function locationPhrase(d: Pick<RuleDraft, 'remote' | 'locations'>): string {
  const parts = [...(d.remote === 'any' ? [] : [REMOTE_LABELS[d.remote]]), ...d.locations];
  return parts.length ? `location: ${parts.join(', ')}` : 'anywhere';
}
export function keywordsPhrase(d: Pick<RuleDraft, 'keywords'>): string {
  return d.keywords.length ? `keywords: ${d.keywords.join(', ')}` : 'any keywords';
}
export function channelsPhrase(d: Pick<RuleDraft, 'channels'>): string {
  const ordered = (['push', 'inapp'] as const).filter((c) => d.channels.includes(c));
  return ordered.length ? ordered.map((c) => CHANNEL_LABELS[c].toLowerCase()).join(' and ') : 'no channel';
}
export function cadencePhrase(d: Pick<RuleDraft, 'cadence' | 'digestTime' | 'digestDay'>): string {
  if (d.cadence === 'instant') return 'instantly';
  if (d.cadence === 'daily') return `daily digest at ${d.digestTime}`;
  return `weekly on ${WEEKDAYS[d.digestDay] ?? 'Monday'} at ${d.digestTime}`;
}

export function clausePhrase(clause: OptionalClause, d: RuleDraft): string {
  switch (clause) {
    case 'type':
      return typePhrase(d);
    case 'deadline':
      return deadlinePhrase(d);
    case 'location':
      return locationPhrase(d);
    case 'keywords':
      return keywordsPhrase(d);
  }
}

/** The whole rule as one plain sentence (card summary, aria-label, live region). */
export function describeDraft(d: RuleDraft): string {
  const conditions = [fitPhrase(d), ...d.clauses.map((c) => clausePhrase(c, d))];
  return `When ${conditions.join(' and ')} → notify me by ${channelsPhrase(d)}, ${cadencePhrase(d)}`;
}

/** Suggested name that follows the sentence until the user edits it ("Strong fit internships"). */
export function suggestName(d: RuleDraft): string {
  const band = d.minFit >= 80 ? 'Strong fit' : d.minFit >= 60 ? 'Good fit' : `Fit ${d.minFit}+`;
  const typed = d.clauses.includes('type') && d.types.length > 0;
  const noun = !typed
    ? 'listings'
    : d.types.length <= 2
      ? d.types.map(pluralType).join(' and ')
      : `listings in ${d.types.length} types`;
  const where =
    d.clauses.includes('location') && (d.remote !== 'any' || d.locations.length)
      ? ` · ${d.remote !== 'any' ? REMOTE_LABELS[d.remote] : (d.locations[0] ?? '')}`
      : '';
  return `${band} ${noun}${where}`.slice(0, 80);
}

function pluralType(t: OpportunityType): string {
  const label = OPPORTUNITY_TYPE_LABELS[t].toLowerCase();
  if (t === 'research' || t === 'opensource') return `${label} programmes`;
  if (t === 'fulltime') return 'full-time roles';
  return `${label}s`;
}

// ── Draft → API input (with inline errors) ─────────────────────────────────────────────────────

export type DraftResult =
  | { ok: true; value: AlertRuleInput; errors: DraftErrors }
  | { ok: false; value: null; errors: DraftErrors };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Validate a draft and map it to `alertRuleInputSchema` (parsed, defaults applied). */
export function draftToInput(d: RuleDraft, options: { timezone?: string } = {}): DraftResult {
  const errors: DraftErrors = {};
  const name = (d.nameTouched ? d.name : d.name || suggestName(d)).trim();

  if (!name) errors.name = 'Give the rule a name.';
  else if (name.length > 80) errors.name = 'Keep the name under 80 characters.';
  if (!Number.isInteger(d.minFit) || d.minFit < 0 || d.minFit > 100) errors.minFit = 'Fit must be 0–100.';

  const hasType = d.clauses.includes('type');
  const hasDeadline = d.clauses.includes('deadline');
  const hasLocation = d.clauses.includes('location');
  const hasKeywords = d.clauses.includes('keywords');

  if (hasType && d.types.length === 0) errors.types = 'Pick at least one type, or remove this condition.';
  if (hasDeadline && (!Number.isInteger(d.deadlineDays) || d.deadlineDays < 1 || d.deadlineDays > 365)) {
    errors.deadlineDays = 'Use 1–365 days.';
  }
  if (hasLocation && d.remote === 'any' && d.locations.length === 0) {
    errors.locations = 'Add a place or Remote, or remove this condition.';
  }
  if (hasLocation && d.locations.length > 20) errors.locations = 'Up to 20 places.';
  if (hasKeywords && d.keywords.length === 0) errors.keywords = 'Add a keyword, or remove this condition.';
  if (hasKeywords && d.keywords.length > 20) errors.keywords = 'Up to 20 keywords.';
  if (hasKeywords && d.keywords.some((k) => k.length > 60)) errors.keywords = 'Keywords are up to 60 characters.';
  if (d.channels.length === 0) errors.channels = 'Pick push, in-app or both.';
  if (d.cadence !== 'instant' && !TIME_RE.test(d.digestTime)) errors.digestTime = 'Use a 24-hour time like 08:00.';

  const candidate = {
    name,
    enabled: d.enabled,
    conditions: {
      minFit: d.minFit,
      types: hasType ? unique(d.types) : [],
      maxDeadlineDays: hasDeadline ? d.deadlineDays : null,
      locations: hasLocation ? unique(d.locations.map((l) => l.trim()).filter(Boolean)) : [],
      remote: hasLocation ? d.remote : 'any',
      keywords: hasKeywords ? unique(d.keywords.map((k) => k.trim()).filter(Boolean)) : [],
    },
    channels: (['push', 'inapp'] as const).filter((c) => d.channels.includes(c)),
    cadence: d.cadence,
    digestTime: d.digestTime,
    digestDay: d.digestDay,
    ...(options.timezone ? { timezone: options.timezone } : {}),
  };

  if (Object.keys(errors).length > 0) return { ok: false, value: null, errors };

  const parsed = alertRuleInputSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = fieldForPath(issue.path);
      errors[field] ??= issue.message;
    }
    return { ok: false, value: null, errors };
  }
  return { ok: true, value: parsed.data, errors };
}

function fieldForPath(path: readonly PropertyKey[]): DraftField {
  const [head, sub] = path;
  if (head === 'conditions') {
    if (sub === 'maxDeadlineDays') return 'deadlineDays';
    if (sub === 'types' || sub === 'locations' || sub === 'keywords' || sub === 'minFit') return sub;
    if (sub === 'remote') return 'locations';
  }
  if (head === 'channels' || head === 'cadence' || head === 'digestTime' || head === 'name') return head;
  return 'name';
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

// ── API rule → draft ───────────────────────────────────────────────────────────────────────────

type RuleLike = Pick<AlertRule, 'name' | 'enabled' | 'conditions' | 'channels' | 'cadence' | 'digestTime' | 'digestDay'>;

export function ruleToDraft(rule: RuleLike): RuleDraft {
  const c = rule.conditions;
  const clauses: OptionalClause[] = [];
  if (c.types.length) clauses.push('type');
  if (c.maxDeadlineDays != null) clauses.push('deadline');
  if (c.locations.length || c.remote !== 'any') clauses.push('location');
  if (c.keywords.length) clauses.push('keywords');
  return {
    name: rule.name,
    nameTouched: true,
    enabled: rule.enabled,
    minFit: c.minFit,
    clauses,
    types: c.types.filter((t): t is OpportunityType => (OPPORTUNITY_TYPES as readonly string[]).includes(t)),
    deadlineDays: c.maxDeadlineDays ?? 14,
    remote: c.remote,
    locations: [...c.locations],
    keywords: [...c.keywords],
    channels: [...rule.channels],
    cadence: rule.cadence,
    digestTime: rule.digestTime,
    digestDay: rule.digestDay,
  };
}

/** Parse a comma/enter separated token list ("go, rust ,  ") into trimmed unique items. */
export function parseTokens(text: string, max = 20): string[] {
  return unique(
    text
      .split(/[,\n]/)
      .map((t) => t.trim())
      .filter(Boolean),
  ).slice(0, max);
}
