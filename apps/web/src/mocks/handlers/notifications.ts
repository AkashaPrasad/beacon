/**
 * MSW handlers for docs/API.md §9 (in-app notifications).
 *
 * Scenario: localStorage['beacon:mock:notifications'] = 'default' (16 items over 9 days, 5 unread)
 *                                                     | 'empty' | 'error'
 */
import type { Notification, NotificationKind } from '@kestrel/shared';
import { delay, http, HttpResponse } from 'msw';

type Scenario = 'default' | 'empty' | 'error';

function scenario(): Scenario {
  try {
    const v = localStorage.getItem('beacon:mock:notifications');
    return v === 'empty' || v === 'error' ? v : 'default';
  } catch {
    return 'default';
  }
}

const HOUR = 3_600_000;

interface Seed {
  kind: NotificationKind;
  title: string;
  body: string;
  url: string | null;
  hoursAgo: number;
  read: boolean;
  listingId?: string;
  trackerItemId?: string;
}

const SEEDS: Seed[] = [
  { kind: 'match', title: 'Strong fit: Platform Engineering Intern', body: 'Northwind Labs · Remote · Fit 86', url: '/radar/lst_01_fullstack_intern', hoursAgo: 1, read: false, listingId: 'lst_01_fullstack_intern' },
  { kind: 'deadline', title: 'Closes tomorrow: ML Research Intern', body: 'Meridian AI Lab · Fit 91', url: '/radar/lst_02_ml_intern', hoursAgo: 3, read: false, listingId: 'lst_02_ml_intern' },
  { kind: 'nudge', title: 'No reply from Kaveri Labs in 10 days', body: 'A short follow-up often gets one.', url: '/tracker', hoursAgo: 5, read: false, trackerItemId: 'trk_02' },
  { kind: 'digest', title: 'Today: 6 new Strong fits · 2 deadlines tomorrow', body: 'Your morning summary.', url: '/radar', hoursAgo: 9, read: true },
  { kind: 'match', title: 'Good fit: Data Analyst Intern', body: 'Acme Analytics · Pune · Fit 72', url: '/radar/lst_05_data_analyst', hoursAgo: 27, read: false, listingId: 'lst_05_data_analyst' },
  { kind: 'source', title: 'Acme careers: couldn’t read the page (403)', body: 'The site blocks crawlers. Fix it in Sources.', url: '/sources', hoursAgo: 30, read: true },
  { kind: 'deadline', title: 'Closes in 3 days: Deccan Hack 2026', body: 'Devfolio · Online · Fit 78', url: '/radar/lst_06_hackathon_deccan', hoursAgo: 34, read: true, listingId: 'lst_06_hackathon_deccan' },
  { kind: 'system', title: 'Your radar is ready: 142 fits', body: 'Personal sources keep updating in the background.', url: '/radar', hoursAgo: 52, read: false },
  { kind: 'match', title: 'Strong fit: Open-source infra mentorship', body: 'Commons Foundation · Remote · Fit 83', url: '/radar/lst_11_opensource_infra', hoursAgo: 60, read: true, listingId: 'lst_11_opensource_infra' },
  { kind: 'digest', title: 'Today: 3 new Strong fits · 1 deadline this week', body: 'Your morning summary.', url: '/radar', hoursAgo: 81, read: true },
  { kind: 'nudge', title: '30 days without a reply from Ridgeway', body: 'Most roles that go quiet this long don’t come back.', url: '/tracker', hoursAgo: 100, read: true, trackerItemId: 'trk_05' },
  { kind: 'deadline', title: 'Closes in 7 days: Saraswati Scholarship', body: 'Saraswati Trust · Fit 69', url: '/radar/lst_08_scholarship_saraswati', hoursAgo: 120, read: true },
  { kind: 'match', title: 'Good fit: NLP Research Intern', body: 'Kalpa Research · Chennai · Fit 74', url: '/radar/lst_10_research_nlp', hoursAgo: 140, read: true },
  { kind: 'system', title: 'Push notifications are on', body: 'Edit what triggers them in Alerts.', url: '/alerts', hoursAgo: 160, read: true },
  { kind: 'match', title: 'Good fit: Backend Engineer', body: 'Lindqvist Systems · Berlin · Fit 66', url: '/radar/lst_04_backend_fulltime', hoursAgo: 190, read: true },
  { kind: 'digest', title: 'Today: 9 new fits · 3 deadlines this week', body: 'Your morning summary.', url: '/radar', hoursAgo: 210, read: true },
];

let db: Notification[] | null = null;

function store(): Notification[] {
  if (db) return db;
  const now = Date.now();
  db =
    scenario() === 'empty'
      ? []
      : SEEDS.map((s, i) => ({
          id: `ntf_${String(i + 1).padStart(2, '0')}`,
          userId: 'usr_aarav',
          kind: s.kind,
          title: s.title,
          body: s.body,
          url: s.url,
          listingId: s.listingId ?? null,
          trackerItemId: s.trackerItemId ?? null,
          alertRuleId: null,
          channels: ['inapp'],
          readAt: s.read ? new Date(now - s.hoursAgo * HOUR + HOUR) : null,
          createdAt: new Date(now - s.hoursAgo * HOUR),
        }));
  return db;
}

/** Test helper: forget all mock state. */
export function resetNotificationsMock(): void {
  db = null;
}

const unread = () => store().filter((n) => !n.readAt).length;

export const notificationsHandlers = [
  http.get('*/v1/notifications', async ({ request }) => {
    await delay(140);
    if (scenario() === 'error') {
      return HttpResponse.json(
        { error: { code: 'SERVICE_UNAVAILABLE', message: "The server didn't respond within 10 seconds." } },
        { status: 503 },
      );
    }
    const params = new URL(request.url).searchParams;
    const limit = Math.min(100, Math.max(1, Number(params.get('limit') ?? 20) || 20));
    const offset = Math.max(0, Number(params.get('cursor') ?? 0) || 0);
    const all = params.get('unreadOnly') === 'true' ? store().filter((n) => !n.readAt) : store();
    const items = all.slice(offset, offset + limit);
    const next = offset + limit < all.length ? String(offset + limit) : null;
    return HttpResponse.json({ items, nextCursor: next, unreadCount: unread() });
  }),

  http.post('*/v1/notifications/read', async ({ request }) => {
    await delay(120);
    const body = (await request.json()) as { ids?: string[]; all?: boolean };
    const now = new Date();
    let updated = 0;
    for (const n of store()) {
      if (n.readAt) continue;
      if (body.all || body.ids?.includes(n.id)) {
        n.readAt = now;
        updated += 1;
      }
    }
    return HttpResponse.json({ updated, unreadCount: unread() });
  }),
];
