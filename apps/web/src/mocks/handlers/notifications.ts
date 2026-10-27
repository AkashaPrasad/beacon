/**
 * MSW handlers for docs/API.md §9 (in-app notifications), cursor-paged. They read and write the shared
 * mock `state.notifications` (../state.ts), so the bell's unread count (`/v1/me`) always agrees.
 *
 * Scenario: localStorage['beacon:mock:notifications'] = 'default' (16 items over 9 days, 5 unread)
 *                                                     | 'empty' | 'error'
 */
import { delay, http, HttpResponse, type HttpResponseResolver } from 'msw';

import type { Notification, NotificationKind } from '@kestrel/shared';

import { state } from '../state';

type Scenario = 'default' | 'empty' | 'error';

function scenario(): Scenario {
  try {
    const v = localStorage.getItem('beacon:mock:notifications');
    return v === 'empty' || v === 'error' ? v : 'default';
  } catch {
    return 'default';
  }
}

const isBrowser = typeof window !== 'undefined' && !('__vitest_worker__' in globalThis);
const wait = (ms: number) => (isBrowser ? delay(ms) : Promise.resolve());

const error = (status: number, code: string, message: string) =>
  HttpResponse.json({ error: { code, message } }, { status });

function guarded(resolver: HttpResponseResolver): HttpResponseResolver {
  return (info) => {
    const method = info.request.method.toUpperCase();
    if (method !== 'GET' && info.request.headers.get('X-Requested-With') !== 'beacon') {
      return error(403, 'CSRF', 'Missing X-Requested-With header');
    }
    if (!state.signedIn) return error(401, 'UNAUTHENTICATED', 'Sign in to continue');
    return resolver(info);
  };
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

/** Copy follows DESIGN §8 (#14, #15, #21) and USERFLOW §1.7 / §3.4. Fictional organisations only. */
const SEEDS: Seed[] = [
  { kind: 'match', title: 'Strong fit: Platform Engineering Intern', body: 'Northwind Labs · Remote · Fit 86', url: null, hoursAgo: 1, read: false, listingId: 'lst_01_fullstack_intern' },
  { kind: 'deadline', title: 'Closes tomorrow: ML Research Intern, Meridian AI Lab. Fit 91.', body: 'Applications close at 23:59 IST.', url: null, hoursAgo: 3, read: false, listingId: 'lst_02_ml_intern' },
  { kind: 'nudge', title: 'No reply from Kaveri Labs in 10 days', body: 'A short follow-up often gets one.', url: '/tracker', hoursAgo: 5, read: false },
  { kind: 'digest', title: 'Today: 6 new Strong fits · 2 deadlines tomorrow', body: 'Your morning summary.', url: '/radar', hoursAgo: 9, read: true },
  { kind: 'match', title: 'Good fit: Data Analyst Intern', body: 'Acme Analytics · Pune · Fit 72', url: null, hoursAgo: 27, read: false, listingId: 'lst_05_data_analyst' },
  { kind: 'source', title: 'Acme careers: couldn’t read the page (403)', body: 'The site blocks crawlers. Fix it in Sources.', url: '/sources', hoursAgo: 30, read: true },
  { kind: 'deadline', title: 'Closes in 3 days: Deccan Hack 2026', body: 'Devfolio · Online · Fit 78', url: null, hoursAgo: 34, read: true, listingId: 'lst_06_hackathon_deccan' },
  { kind: 'system', title: 'Radar ready: 142 fits', body: 'Personal sources keep updating in the background.', url: '/radar', hoursAgo: 52, read: false },
  { kind: 'match', title: 'Strong fit: Open-source infra mentorship', body: 'Commons Foundation · Remote · Fit 83', url: null, hoursAgo: 60, read: true, listingId: 'lst_11_opensource_infra' },
  { kind: 'digest', title: 'Today: 3 new Strong fits · 1 deadline this week', body: 'Your morning summary.', url: '/radar', hoursAgo: 81, read: true },
  { kind: 'nudge', title: '30 days without a reply from Ridgeway', body: 'Most roles that go quiet this long don’t come back.', url: '/tracker', hoursAgo: 100, read: true },
  { kind: 'deadline', title: 'Closes in 7 days: Saraswati Scholarship', body: 'Saraswati Trust · Fit 69', url: null, hoursAgo: 120, read: true, listingId: 'lst_08_scholarship_saraswati' },
  { kind: 'match', title: 'Good fit: NLP Research Intern', body: 'Kalpa Research · Chennai · Fit 74', url: null, hoursAgo: 140, read: true, listingId: 'lst_10_research_nlp' },
  { kind: 'system', title: 'Push is on', body: 'Edit what triggers it in Alerts.', url: '/alerts', hoursAgo: 160, read: true },
  { kind: 'match', title: 'Good fit: Backend Engineer', body: 'Lindqvist Systems · Berlin · Fit 66', url: null, hoursAgo: 190, read: true, listingId: 'lst_04_backend_fulltime' },
  { kind: 'digest', title: 'Today: 9 new fits · 3 deadlines this week', body: 'Your morning summary.', url: '/radar', hoursAgo: 210, read: true },
];

let seeded = false;

function store(): Notification[] {
  if (!seeded) {
    seeded = true;
    const now = Date.now();
    const userId = state.user.id;
    const items: Notification[] =
      scenario() === 'empty'
        ? []
        : SEEDS.map((s, i) => ({
            id: `65f0c0ffee00000000c1${String(i + 1).padStart(4, '0')}`,
            userId,
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
    // Replace in place: the foundation's /v1/me reads the same array for `unreadNotifications`.
    state.notifications.splice(0, state.notifications.length, ...items);
  }
  return state.notifications;
}

/** Test helper: re-seed on next access. */
export function resetNotificationsMock(): void {
  seeded = false;
}

const unread = () => store().filter((n) => !n.readAt).length;

export const notificationsHandlers = [
  http.get(
    '*/v1/notifications',
    guarded(async ({ request }) => {
      await wait(140);
      if (scenario() === 'error') {
        return error(503, 'SERVICE_UNAVAILABLE', "The server didn't respond within 10 seconds.");
      }
      const params = new URL(request.url).searchParams;
      const limit = Math.min(100, Math.max(1, Number(params.get('limit') ?? 20) || 20));
      const offset = Math.max(0, Number(params.get('cursor') ?? 0) || 0);
      const all = params.get('unreadOnly') === 'true' ? store().filter((n) => !n.readAt) : store();
      const items = all.slice(offset, offset + limit);
      const next = offset + limit < all.length ? String(offset + limit) : null;
      return HttpResponse.json({ items, nextCursor: next, unreadCount: unread() });
    }),
  ),

  http.post(
    '*/v1/notifications/read',
    guarded(async ({ request }) => {
      await wait(120);
      const body = (await request.json()) as { ids?: string[]; all?: boolean };
      if (!body.all && (!Array.isArray(body.ids) || body.ids.length === 0 || body.ids.length > 200)) {
        return error(400, 'VALIDATION', 'Send { ids: string[] (1..200) } or { all: true }.');
      }
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
  ),
];
