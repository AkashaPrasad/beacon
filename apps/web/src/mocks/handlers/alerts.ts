/**
 * MSW handlers for docs/API.md §8 (alert rules CRUD + test) and the requested
 * `POST /v1/alerts/preview` ("would have matched N in the last 7 days"; SHARED-REQUESTS web → api).
 *
 * Scenario: localStorage['beacon:mock:alerts'] = 'default' (2 rules) | 'empty'.
 */
import { delay, http, HttpResponse } from 'msw';

interface MockRule {
  id: string;
  userId: string;
  name: string;
  enabled: boolean;
  conditions: {
    minFit: number;
    types: string[];
    maxDeadlineDays: number | null;
    locations: string[];
    remote: 'any' | 'remote' | 'hybrid' | 'onsite';
    keywords: string[];
  };
  channels: ('push' | 'inapp')[];
  cadence: 'instant' | 'daily' | 'weekly';
  digestTime: string;
  digestDay: number;
  quietHours: { start: string; end: string } | null;
  timezone: string;
  lastTriggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
  stats: { matchesByDay: number[]; matchesLast7d: number };
}

const USER_ID = '650000000000000000000001';
const HOUR = 3_600_000;

function readScenario(key: string, fallback: string): string {
  try {
    return localStorage.getItem(`beacon:mock:${key}`) ?? fallback;
  } catch {
    return fallback;
  }
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return Math.abs(h);
}

/** Deterministic "matches per day" for a rule's conditions: stricter rules match less. */
function statsFor(conditions: MockRule['conditions']) {
  const strictness =
    (conditions.minFit - 40) / 15 +
    (conditions.types.length ? 1 : 0) +
    (conditions.maxDeadlineDays ? 1 : 0) +
    (conditions.locations.length || conditions.remote !== 'any' ? 1 : 0) +
    conditions.keywords.length;
  const scale = Math.max(1, Math.round(9 - strictness * 1.4));
  const seed = hash(JSON.stringify(conditions));
  const matchesByDay = Array.from({ length: 7 }, (_, i) => (Math.imul(seed ^ (i + 1), 2654435761) >>> 0) % (scale + 1));
  return { matchesByDay, matchesLast7d: matchesByDay.reduce((a, b) => a + b, 0) };
}

let seq = 0;
const oid = () => `8a${(seq += 1).toString(16).padStart(22, '0')}`;

function rule(partial: Partial<MockRule> & Pick<MockRule, 'name' | 'conditions'>): MockRule {
  const now = new Date().toISOString();
  return {
    id: oid(),
    userId: USER_ID,
    enabled: true,
    channels: ['push', 'inapp'],
    cadence: 'instant',
    digestTime: '08:00',
    digestDay: 1,
    quietHours: null,
    timezone: 'Asia/Kolkata',
    lastTriggeredAt: null,
    createdAt: now,
    updatedAt: now,
    stats: statsFor(partial.conditions),
    ...partial,
  };
}

function seed(): MockRule[] {
  seq = 0;
  if (readScenario('alerts', 'default') === 'empty') return [];
  return [
    rule({
      name: 'Strong fit internships',
      conditions: { minFit: 80, types: ['internship'], maxDeadlineDays: null, locations: [], remote: 'any', keywords: [] },
      lastTriggeredAt: new Date(Date.now() - 5 * HOUR).toISOString(),
    }),
    rule({
      name: 'Hackathons closing soon',
      channels: ['inapp'],
      cadence: 'daily',
      conditions: { minFit: 60, types: ['hackathon'], maxDeadlineDays: 14, locations: ['Bengaluru'], remote: 'remote', keywords: [] },
      lastTriggeredAt: new Date(Date.now() - 26 * HOUR).toISOString(),
    }),
  ];
}

let rules: MockRule[] | null = null;
function db(): MockRule[] {
  rules ??= seed();
  return rules;
}

export function resetAlertsMock(): void {
  rules = null;
}

function notFound() {
  return HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'Alert rule not found' } }, { status: 404 });
}

function validation(message: string, path: string[]) {
  return HttpResponse.json(
    { error: { code: 'VALIDATION', message: 'Invalid request', issues: [{ path, code: 'custom', message }] } },
    { status: 400 },
  );
}

function normaliseConditions(c: Partial<MockRule['conditions']> | undefined): MockRule['conditions'] {
  return {
    minFit: c?.minFit ?? 70,
    types: c?.types ?? [],
    maxDeadlineDays: c?.maxDeadlineDays ?? null,
    locations: c?.locations ?? [],
    remote: c?.remote ?? 'any',
    keywords: c?.keywords ?? [],
  };
}

export const alertsHandlers = [
  http.get('*/v1/alerts', async () => {
    await delay(120);
    return HttpResponse.json({ items: db() });
  }),

  http.post('*/v1/alerts/preview', async ({ request }) => {
    const body = (await request.json().catch(() => null)) as { conditions?: Partial<MockRule['conditions']> } | null;
    await delay(180);
    const conditions = normaliseConditions(body?.conditions);
    const { matchesLast7d } = statsFor(conditions);
    return HttpResponse.json({ matchesLast7d, sample: [] });
  }),

  http.post('*/v1/alerts', async ({ request }) => {
    const body = (await request.json().catch(() => null)) as Partial<MockRule> | null;
    await delay(220);
    if (!body?.name?.trim()) return validation('Required', ['name']);
    const channels = body.channels ?? ['inapp', 'push'];
    if (!channels.length || channels.some((c) => c !== 'push' && c !== 'inapp')) {
      return validation('Pick at least one channel', ['channels']);
    }
    const conditions = normaliseConditions(body.conditions);
    const created = rule({
      name: body.name.trim(),
      enabled: body.enabled ?? true,
      conditions,
      channels,
      cadence: body.cadence ?? 'instant',
      digestTime: body.digestTime ?? '09:00',
      digestDay: body.digestDay ?? 1,
      quietHours: body.quietHours ?? null,
      timezone: body.timezone ?? 'Asia/Kolkata',
    });
    db().unshift(created);
    return HttpResponse.json({ rule: created }, { status: 201 });
  }),

  http.get('*/v1/alerts/:id', ({ params }) => {
    const found = db().find((r) => r.id === params.id);
    return found ? HttpResponse.json({ rule: found }) : notFound();
  }),

  http.patch('*/v1/alerts/:id', async ({ params, request }) => {
    await delay(160);
    const found = db().find((r) => r.id === params.id);
    if (!found) return notFound();
    const patch = (await request.json().catch(() => ({}))) as Partial<MockRule>;
    if (patch.channels && patch.channels.length === 0) return validation('Pick at least one channel', ['channels']);
    const { conditions, ...rest } = patch;
    Object.assign(found, rest);
    if (conditions) found.conditions = { ...found.conditions, ...conditions };
    found.stats = statsFor(found.conditions);
    found.updatedAt = new Date().toISOString();
    return HttpResponse.json({ rule: found });
  }),

  http.delete('*/v1/alerts/:id', async ({ params }) => {
    await delay(140);
    const before = db().length;
    rules = db().filter((r) => r.id !== params.id);
    return before === rules.length ? notFound() : new HttpResponse(null, { status: 204 });
  }),

  http.post('*/v1/alerts/:id/test', async ({ params }) => {
    await delay(250);
    const found = db().find((r) => r.id === params.id);
    if (!found) return notFound();
    found.lastTriggeredAt = new Date().toISOString();
    return HttpResponse.json({ queued: true, jobId: `notify-test-${found.id}-${Date.now()}` }, { status: 202 });
  }),
];
