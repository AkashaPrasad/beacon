/**
 * MSW handlers for docs/API.md §7 (tracker CRUD, move, analytics).
 *
 * Scenario: localStorage['beacon:mock:tracker'] = 'default' | 'empty'.
 * The seed covers every nudge path relative to "now": Applied 12 d (follow-up), Applied 34 d (ghosted
 * suggestion), Interview 8 d ("Any news?"), OA due tomorrow, plus fresh cards.
 * A move with `position` and the header `X-Mock-Stale: 1` returns 409 (two-tab conflict tests).
 */
import { delay, http, HttpResponse } from 'msw';

type Stage = 'saved' | 'applied' | 'oa' | 'interview' | 'offer' | 'rejected' | 'ghosted';
const STAGES: Stage[] = ['saved', 'applied', 'oa', 'interview', 'offer', 'rejected', 'ghosted'];

interface MockItem {
  id: string;
  userId: string;
  listingId: string | null;
  title: string;
  company: string;
  type: string | null;
  applyUrl: string | null;
  deadlineAt: string | null;
  sourceId: string | null;
  stage: Stage;
  position: number;
  notes: string;
  contacts: { name: string; role: string | null; email: string | null; url: string | null; notes: string | null }[];
  documents: { name: string; url: string; kind: string; addedAt: string }[];
  appliedAt: string | null;
  lastActivityAt: string;
  nudges: { kind: string; dueAt: string; sentAt: string | null; dismissedAt: string | null }[];
  createdAt: string;
  updatedAt: string;
  history: { stage: Stage; at: string }[];
}

const USER_ID = '650000000000000000000001';
const DAY = 86_400_000;
const SOURCES: Record<string, string> = {
  '6c0000000000000000000001': 'Razorpay',
  '6c0000000000000000000002': 'CRED',
  '6a0000000000000000000001': 'Stripe',
  '6a0000000000000000000005': 'Meridian AI Lab',
  '6c0000000000000000000099': 'YC startups hiring interns',
};

function readScenario(key: string, fallback: string): string {
  try {
    return localStorage.getItem(`beacon:mock:${key}`) ?? fallback;
  } catch {
    return fallback;
  }
}

const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const ahead = (days: number) => new Date(Date.now() + days * DAY).toISOString();

let seq = 0;
const oid = () => `7a${(seq += 1).toString(16).padStart(22, '0')}`;

function item(
  stage: Stage,
  position: number,
  title: string,
  company: string,
  opts: Partial<MockItem> & { appliedDaysAgo?: number; activityDaysAgo?: number } = {},
): MockItem {
  const { appliedDaysAgo, activityDaysAgo, ...rest } = opts;
  const applied = appliedDaysAgo != null ? ago(appliedDaysAgo) : null;
  const activity = ago(activityDaysAgo ?? appliedDaysAgo ?? 2);
  const history: MockItem['history'] = [{ stage: 'saved', at: ago((appliedDaysAgo ?? 2) + 3) }];
  if (applied) history.push({ stage: 'applied', at: applied });
  if (stage !== 'saved' && stage !== 'applied') history.push({ stage, at: activity });
  return {
    id: oid(),
    userId: USER_ID,
    listingId: null,
    title,
    company,
    type: 'internship',
    applyUrl: null,
    deadlineAt: null,
    sourceId: null,
    stage,
    position,
    notes: '',
    contacts: [],
    documents: [],
    appliedAt: applied,
    lastActivityAt: activity,
    nudges: [],
    createdAt: history[0]?.at ?? ago(5),
    updatedAt: activity,
    history,
    ...rest,
  };
}

function seed(): MockItem[] {
  if (readScenario('tracker', 'default') === 'empty') return [];
  seq = 0;
  return [
    item('saved', 0, 'Backend Engineering Intern', 'Northwind Labs', {
      deadlineAt: ahead(6),
      listingId: 'lst_northwind_backend',
      applyUrl: 'https://northwind.example/jobs/backend-intern',
      sourceId: '6a0000000000000000000001',
    }),
    item('saved', 1, 'Monsoon Hack 2026', 'Devfolio', { type: 'hackathon', deadlineAt: ahead(3) }),
    item('saved', 2, 'Summer Research Fellowship', 'Indus Institute of Science', { type: 'fellowship', deadlineAt: ahead(21) }),
    item('applied', 0, 'Platform Engineering Intern', 'Northwind Labs', {
      appliedDaysAgo: 12,
      sourceId: '6a0000000000000000000001',
      listingId: 'lst_platform_intern',
      notes: 'Referred by Priya (alumni). Mentioned Go + Postgres in the cover note.',
      contacts: [{ name: 'Priya Raman', role: 'Engineering manager', email: null, url: 'https://linkedin.com/in/example', notes: null }],
      documents: [{ name: 'Resume v4', url: 'https://drive.example/resume-v4.pdf', kind: 'resume', addedAt: ago(12) }],
    }),
    item('applied', 1, 'Data Analyst Intern', 'Acme Analytics', { appliedDaysAgo: 34, sourceId: '6c0000000000000000000001' }),
    item('applied', 2, 'Frontend Intern', 'Kestrel Pay', { appliedDaysAgo: 3, sourceId: '6c0000000000000000000099' }),
    item('oa', 0, 'SDE Intern', 'Acme', { appliedDaysAgo: 9, activityDaysAgo: 2, deadlineAt: ahead(0.6), sourceId: '6c0000000000000000000002' }),
    item('interview', 0, 'ML Research Intern', 'Meridian AI Lab', {
      appliedDaysAgo: 20,
      activityDaysAgo: 8,
      type: 'research',
      sourceId: '6a0000000000000000000005',
    }),
    item('offer', 0, 'Mobile Engineering Intern', 'Lotus Labs', {
      appliedDaysAgo: 30,
      activityDaysAgo: 1,
      deadlineAt: ahead(5),
      sourceId: '6c0000000000000000000099',
    }),
    item('rejected', 0, 'Growth Intern', 'Saffron Foods', { appliedDaysAgo: 25, activityDaysAgo: 15, type: 'internship', sourceId: '6c0000000000000000000002' }),
    item('ghosted', 0, 'Security Intern', 'Harbor Systems', { appliedDaysAgo: 48, activityDaysAgo: 40, sourceId: '6c0000000000000000000001' }),
  ];
}

let items: MockItem[] | null = null;
function db(): MockItem[] {
  items ??= seed();
  return items;
}

export function resetTrackerMock(): void {
  items = null;
}

function column(stage: Stage): MockItem[] {
  return db()
    .filter((i) => i.stage === stage)
    .sort((a, b) => a.position - b.position);
}

function reindex(stage: Stage) {
  column(stage).forEach((it, idx) => {
    it.position = idx;
  });
}

function sorted(): MockItem[] {
  return [...db()].sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || a.position - b.position);
}

function notFound() {
  return HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'Tracker item not found' } }, { status: 404 });
}

function analytics() {
  const all = db();
  const ever = all.filter((i) => i.appliedAt);
  const respondedItems = ever.filter((i) => i.history.some((h) => ['oa', 'interview', 'offer', 'rejected'].includes(h.stage)));
  const responseDays = respondedItems
    .map((i) => {
      const applied = Date.parse(i.appliedAt ?? '');
      const first = i.history.find((h) => ['oa', 'interview', 'offer', 'rejected'].includes(h.stage));
      return first ? Math.max(0, Math.round((Date.parse(first.at) - applied) / DAY)) : null;
    })
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b);
  const median =
    responseDays.length === 0
      ? null
      : responseDays.length % 2
        ? (responseDays[(responseDays.length - 1) / 2] ?? null)
        : Math.round(((responseDays[responseDays.length / 2 - 1] ?? 0) + (responseDays[responseDays.length / 2] ?? 0)) / 2);
  const bySource = new Map<string, { applied: number; responded: number }>();
  for (const i of ever) {
    if (!i.sourceId) continue;
    const row = bySource.get(i.sourceId) ?? { applied: 0, responded: 0 };
    row.applied += 1;
    if (respondedItems.includes(i)) row.responded += 1;
    bySource.set(i.sourceId, row);
  }
  const stageCounts = Object.fromEntries(STAGES.map((s) => [s, all.filter((i) => i.stage === s).length]));
  const quiet = (min: number) =>
    all
      .filter((i) => i.stage === 'applied' && i.appliedAt)
      .map((i) => ({ i, days: Math.floor((Date.now() - Date.parse(i.lastActivityAt)) / DAY) }))
      .filter(({ days }) => days >= min)
      .map(({ i, days }) => ({ id: i.id, title: i.title, company: i.company, appliedAt: i.appliedAt, daysSinceActivity: days }));
  return {
    total: all.length,
    applied: ever.length,
    responded: respondedItems.length,
    responseRate: ever.length ? respondedItems.length / ever.length : 0,
    medianResponseDays: median,
    stageCounts,
    bestSources: [...bySource.entries()]
      .map(([sourceId, r]) => ({
        sourceId,
        name: SOURCES[sourceId] ?? 'Unknown source',
        applied: r.applied,
        responded: r.responded,
        responseRate: r.applied ? r.responded / r.applied : 0,
      }))
      .sort((a, b) => b.responseRate - a.responseRate || b.applied - a.applied)
      .slice(0, 4),
    followUp: quiet(10).filter((x) => x.daysSinceActivity < 30),
    moveOn: quiet(30),
  };
}

export const trackerHandlers = [
  http.get('*/v1/tracker', async ({ request }) => {
    await delay(140);
    const stage = new URL(request.url).searchParams.get('stage');
    return HttpResponse.json({ items: sorted().filter((i) => !stage || i.stage === stage) });
  }),

  http.get('*/v1/tracker/analytics', async () => {
    await delay(160);
    return HttpResponse.json(analytics());
  }),

  http.post('*/v1/tracker', async ({ request }) => {
    await delay(220);
    const body = (await request.json().catch(() => null)) as
      | { listingId?: string; stage?: Stage; notes?: string; manual?: { title: string; company: string; url?: string; type?: string; deadlineAt?: string } }
      | null;
    if (!body || (!body.listingId && !body.manual?.title?.trim())) {
      return HttpResponse.json({ error: { code: 'VALIDATION', message: 'Invalid request' } }, { status: 400 });
    }
    if (body.listingId) {
      const existing = db().find((i) => i.listingId === body.listingId);
      if (existing) {
        return HttpResponse.json(
          { error: { code: 'CONFLICT', message: 'Already tracked', details: { existingId: existing.id } } },
          { status: 409 },
        );
      }
    }
    const stage = body.stage ?? 'saved';
    const now = new Date().toISOString();
    const created = item(stage, -1, body.manual?.title.trim() ?? 'Tracked listing', body.manual?.company.trim() ?? 'Company', {
      listingId: body.listingId ?? null,
      applyUrl: body.manual?.url ?? null,
      type: body.manual?.type ?? null,
      deadlineAt: body.manual?.deadlineAt ?? null,
      notes: body.notes ?? '',
      appliedAt: stage === 'applied' ? now : null,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
      history: [{ stage, at: now }],
    });
    db().push(created);
    reindex(stage);
    return HttpResponse.json({ item: created }, { status: 201 });
  }),

  http.get('*/v1/tracker/:id', ({ params }) => {
    const found = db().find((i) => i.id === params.id);
    return found ? HttpResponse.json({ item: found }) : notFound();
  }),

  http.patch('*/v1/tracker/:id', async ({ params, request }) => {
    await delay(180);
    const found = db().find((i) => i.id === params.id);
    if (!found) return notFound();
    const patch = (await request.json().catch(() => ({}))) as Partial<MockItem>;
    const before = found.stage;
    for (const key of ['notes', 'contacts', 'documents', 'appliedAt', 'deadlineAt', 'title', 'company', 'applyUrl'] as const) {
      if (patch[key] !== undefined) (found as unknown as Record<string, unknown>)[key] = patch[key];
    }
    if (patch.stage && patch.stage !== before) {
      found.stage = patch.stage;
      found.position = -1;
      found.history.push({ stage: patch.stage, at: new Date().toISOString() });
      found.lastActivityAt = new Date().toISOString();
      if (patch.stage === 'applied' && !found.appliedAt) found.appliedAt = found.lastActivityAt;
      reindex(before);
      reindex(patch.stage);
    }
    found.updatedAt = new Date().toISOString();
    return HttpResponse.json({ item: found });
  }),

  http.post('*/v1/tracker/:id/move', async ({ params, request }) => {
    await delay(200);
    if (request.headers.get('X-Mock-Stale') === '1' || readScenario('tracker-move', '') === 'conflict') {
      return HttpResponse.json({ error: { code: 'CONFLICT', message: 'This card changed in another tab' } }, { status: 409 });
    }
    const found = db().find((i) => i.id === params.id);
    if (!found) return notFound();
    const body = (await request.json().catch(() => null)) as { stage?: Stage; position?: number } | null;
    if (!body?.stage || !STAGES.includes(body.stage) || typeof body.position !== 'number') {
      return HttpResponse.json({ error: { code: 'VALIDATION', message: 'Invalid request' } }, { status: 400 });
    }
    const from = found.stage;
    const target = column(body.stage).filter((i) => i.id !== found.id);
    const index = Math.max(0, Math.min(Math.trunc(body.position), target.length));
    target.splice(index, 0, found);
    target.forEach((it, idx) => {
      it.position = idx;
    });
    if (from !== body.stage) {
      const now = new Date().toISOString();
      found.stage = body.stage;
      found.history.push({ stage: body.stage, at: now });
      found.lastActivityAt = now;
      found.nudges = [];
      if (body.stage === 'applied' && !found.appliedAt) found.appliedAt = now;
      reindex(from);
    }
    found.updatedAt = new Date().toISOString();
    return HttpResponse.json({ item: found, column: target.map((it) => ({ id: it.id, position: it.position })) });
  }),

  http.delete('*/v1/tracker/:id', async ({ params }) => {
    await delay(150);
    const found = db().find((i) => i.id === params.id);
    if (!found) return notFound();
    items = db().filter((i) => i.id !== params.id);
    reindex(found.stage);
    return new HttpResponse(null, { status: 204 });
  }),
];
