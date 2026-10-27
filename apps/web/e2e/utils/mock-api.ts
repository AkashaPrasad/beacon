/**
 * Playwright-side fake of the Beacon API (docs/API.md), served with `page.route` on any origin
 * for paths under `/v1/` plus `/healthz` and `/readyz`. State lives in Node (`MockState`), so a
 * test can change the world mid-session (credits run out, the key is removed in another tab)
 * and two pages of one context share it (two-tab tracker test).
 *
 * It behaves like the real API where the web app could get it wrong: CSRF header required on
 * mutations (403 CSRF), 401 with `details.reason` when signed out, cursor pagination, CORS
 * headers echoing the page origin with credentials.
 */
import type { BrowserContext, Page, Request, Route } from '@playwright/test';

import type { AlertRule, TrackerStage } from '@kestrel/shared';

import {
  createState,
  feedItem,
  fixtureUsers,
  hexId,
  normaliseInputUrl,
  makeSource,
  utcDate,
  type DetectResult,
  type FeedItemDTO,
  type FixtureUser,
  type MockState,
  type OnboardingStep,
  type TrackerItemDTO,
} from './mock-data';

export interface RecordedRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
  at: number;
  status: number;
}

interface Ctx {
  req: Request;
  url: URL;
  params: Record<string, string>;
  body: unknown;
  state: MockState;
}

type Reply = { status: number; body?: unknown; headers?: Record<string, string> };
type Handler = (ctx: Ctx) => Reply | Promise<Reply>;

const json = (status: number, body?: unknown, headers?: Record<string, string>): Reply => ({
  status,
  body,
  headers,
});
const err = (
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): Reply => json(status, { error: { code, message, ...(details ? { details } : {}) } });
const notFound = (what = 'Not found') => err(404, 'NOT_FOUND', what);

const STAGES: readonly TrackerStage[] = [
  'saved',
  'applied',
  'oa',
  'interview',
  'offer',
  'rejected',
  'ghosted',
];
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const PUBLIC = [
  /^\/healthz$/,
  /^\/readyz$/,
  /^\/v1\/meta$/,
  /^\/v1\/auth\/google$/,
  /^\/v1\/auth\/logout$/,
  /^\/v1\/push\/vapid-public-key$/,
];

const encodeCursor = (offset: number) =>
  Buffer.from(JSON.stringify({ k: 'fit', o: offset })).toString('base64url');
function decodeCursor(cursor: string | null): number | null {
  if (!cursor) return 0;
  try {
    const v = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { o?: unknown };
    return typeof v.o === 'number' && v.o >= 0 ? v.o : null;
  } catch {
    return null;
  }
}

export class MockApi {
  readonly state: MockState;
  readonly requests: RecordedRequest[] = [];
  /** When true every API request fails like a dropped connection (pair with context.setOffline). */
  offline = false;
  private readonly routes: { method: string; re: RegExp; keys: string[]; handler: Handler }[] = [];

  constructor(state: MockState = createState()) {
    this.state = state;
    this.register();
  }

  // ── Wiring ───────────────────────────────────────────────────────────────

  /** Install on a page (or a whole context, so pages opened later share it). */
  async install(target: Page | BrowserContext): Promise<void> {
    await target.addInitScript(() => {
      (window as unknown as { __BEACON_E2E__: unknown }).__BEACON_E2E__ = {
        transport: 'playwright',
      };
    });
    await target.route(
      (url) => /^\/(v1\/|healthz$|readyz$)/.test(url.pathname),
      (route) => this.handle(route),
    );
  }

  /** Requests seen so far for `METHOD /path` (path without query; `:id` style not supported). */
  calls(method: string, path: string | RegExp): RecordedRequest[] {
    return this.requests.filter(
      (r) =>
        r.method === method && (typeof path === 'string' ? r.path === path : path.test(r.path)),
    );
  }

  signIn(user: FixtureUser): void {
    this.state.session = user;
  }

  // ── Dispatch ─────────────────────────────────────────────────────────────

  private on(method: string, pattern: string, handler: Handler): void {
    const keys: string[] = [];
    const re = new RegExp(
      '^' +
        pattern.replace(/:([a-zA-Z]+)/g, (_m, k: string) => {
          keys.push(k);
          return '([^/]+)';
        }) +
        '$',
    );
    this.routes.push({ method, re, keys, handler });
  }

  private async handle(route: Route): Promise<void> {
    const req = route.request();
    const url = new URL(req.url());
    const origin = (await req.headerValue('origin')) ?? '';
    const cors: Record<string, string> = origin
      ? {
          'access-control-allow-origin': origin,
          'access-control-allow-credentials': 'true',
          'access-control-expose-headers':
            'RateLimit, RateLimit-Policy, Retry-After, X-Request-Id, Content-Disposition',
          vary: 'Origin',
        }
      : {};

    if (req.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          ...cors,
          'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE',
          'access-control-allow-headers': 'Content-Type, X-Requested-With, Authorization',
          'access-control-max-age': '600',
        },
      });
      return;
    }

    if (this.offline) {
      await route.abort('internetdisconnected');
      return;
    }

    const reply = await this.dispatch(req, url);
    if (this.state.latencyMs > 0) await new Promise((r) => setTimeout(r, this.state.latencyMs));
    this.requests.push({
      method: req.method(),
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body: parseBody(req),
      at: Date.now(),
      status: reply.status,
    });
    const isJson = reply.body !== undefined && typeof reply.body !== 'string';
    await route.fulfill({
      status: reply.status,
      headers: {
        ...cors,
        'x-request-id': `e2e-${this.requests.length}`,
        ...(isJson ? { 'content-type': 'application/json; charset=utf-8' } : {}),
        ...reply.headers,
      },
      body:
        reply.body === undefined
          ? ''
          : isJson
            ? JSON.stringify(reply.body)
            : (reply.body as string),
    });
  }

  private async dispatch(req: Request, url: URL): Promise<Reply> {
    const method = req.method();
    const path = url.pathname;
    const injected = this.state.failures.get(`${method} ${path}`);
    if (injected && injected.times > 0) {
      injected.times -= 1;
      return err(injected.status, injected.code, injected.message);
    }
    if (MUTATING.has(method) && path.startsWith('/v1/')) {
      const xrw = (await req.headerValue('x-requested-with'))?.toLowerCase();
      const bearer = (await req.headerValue('authorization'))?.startsWith('Bearer ');
      if (!bearer && xrw !== 'beacon' && xrw !== 'kestrel')
        return err(403, 'CSRF', 'Missing X-Requested-With: beacon');
    }
    if (!PUBLIC.some((re) => re.test(path)) && !this.state.session) {
      return err(401, 'UNAUTHENTICATED', 'Sign in to continue', { reason: 'missing' });
    }
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = r.re.exec(path);
      if (!m) continue;
      const params = Object.fromEntries(
        r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1] ?? '')]),
      );
      return r.handler({ req, url, params, body: parseBody(req), state: this.state });
    }
    return notFound('Route not found');
  }

  // ── Routes (docs/API.md) ─────────────────────────────────────────────────

  private register(): void {
    const s = () => this.state;

    // Platform
    this.on('GET', '/healthz', () => json(200, { ok: true }));
    this.on('GET', '/readyz', () => json(200, { ok: true, mongo: 'up', redis: 'up' }));
    this.on('GET', '/v1/meta', () =>
      json(200, {
        name: 'beacon',
        version: 'e2e',
        opportunityTypes: [],
        sourceKinds: [],
        trackerStages: STAGES.map((id) => ({ id, label: id })),
        packs: s().packs.map((p) => ({ id: p.id, name: p.name })),
      }),
    );

    // Auth & me
    this.on('POST', '/v1/auth/google', () => {
      const g = s().googleLogin;
      if ('error' in g)
        return err(401, 'INVALID_GOOGLE_TOKEN', 'Google sign-in could not be verified');
      s().session = g.user;
      return json(
        200,
        { user: publicUser(g.user), isNew: g.isNew },
        {
          'set-cookie': 'beacon_session=e2e; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800',
        },
      );
    });
    this.on('POST', '/v1/auth/logout', () => {
      s().session = null;
      return json(204);
    });
    this.on('GET', '/v1/me', () => json(200, this.me()));
    this.on('PATCH', '/v1/me', ({ body }) => {
      const b = (body ?? {}) as {
        onboardingStep?: OnboardingStep;
        onboardingCompleted?: boolean;
        consent?: { aiMode: FixtureUser['aiMode'] };
        name?: string;
      };
      const u = s().session!;
      s().session = {
        ...u,
        name: b.name ?? u.name,
        onboardingStep: b.onboardingCompleted ? 'done' : (b.onboardingStep ?? u.onboardingStep),
        aiMode: b.consent?.aiMode ?? u.aiMode,
      };
      if (b.consent) s().settings.ai.enabled = b.consent.aiMode !== 'off';
      return json(200, this.me());
    });

    // Profile & resume
    this.on('GET', '/v1/profile', () => json(200, this.profileResponse()));
    const putProfile: Handler = ({ body }) => {
      const st = s();
      st.profile = {
        ...(st.profile ?? emptyProfile(st.session!.id)),
        ...(body as object),
        userId: st.session!.id,
      } as MockState['profile'];
      return json(200, this.profileResponse());
    };
    this.on('PUT', '/v1/profile', putProfile);
    this.on('PATCH', '/v1/profile', putProfile);
    this.on('POST', '/v1/profile/resume', ({ req, url }) => {
      const buf = req.postDataBuffer();
      if (!buf || buf.length === 0) return err(400, 'BAD_REQUEST', 'Missing file');
      if (buf.length > 10 * 1024 * 1024)
        return err(413, 'PAYLOAD_TOO_LARGE', 'Resume is larger than 10 MB');
      const head = buf.subarray(0, 4096).toString('latin1');
      const okType = /application\/pdf|wordprocessingml|filename="[^"]+\.(pdf|docx)"/i.test(head);
      if (!okType) return err(415, 'UNSUPPORTED_MEDIA_TYPE', 'Upload a PDF or DOCX');
      const up = s().resumeUpload;
      if (!up.ok) return err(up.status, up.code, up.message);
      const save = url.searchParams.get('save') === 'true';
      if (save) s().hasResume = true;
      return json(200, { ...up.body, saved: save });
    });

    // Sources
    this.on('GET', '/v1/sources', () => json(200, { items: s().sources }));
    this.on('POST', '/v1/sources', ({ body }) => {
      const b = (body ?? {}) as { url?: string; name?: string };
      if (!b.url) return err(400, 'VALIDATION', 'Invalid request', { location: 'body' });
      const key = normaliseInputUrl(b.url);
      const existing =
        s().conflicts.get(key) ?? s().sources.find((x) => normaliseInputUrl(x.url) === key)?.id;
      if (existing)
        return err(409, 'CONFLICT', 'You already added this source', { existingId: existing });
      const det = this.detectFor(b.url);
      const src = makeSource(s().sources.length + 10, {
        url: det.finalUrl ?? b.url,
        name: b.name ?? det.name ?? b.url,
        kind: det.kind,
        health: 'pending',
        healthCode: null,
        listingsFound: 0,
        lastCheckedAt: null,
        ownerId: s().session!.id,
        config: det.config,
      });
      s().sources.unshift(src);
      return json(201, { source: src, detection: det });
    });
    this.on('GET', '/v1/sources/community', () =>
      json(200, {
        items: s().packs.flatMap((p, pi) =>
          Array.from({ length: 3 }, (_v, i) => ({
            ...makeSource(1000 + pi * 10 + i, {
              scope: 'community',
              ownerId: null,
              packId: p.id,
              name: `${p.name} source ${i + 1}`,
            }),
            subscribed: p.enabled,
          })),
        ),
        nextCursor: null,
      }),
    );
    this.on('GET', '/v1/sources/packs', () => json(200, { items: s().packs }));
    this.on('POST', '/v1/sources/packs/:packId/enable', ({ params }) => {
      const p = s().packs.find((x) => x.id === params.packId);
      if (!p) return notFound('Pack not found');
      p.enabled = true;
      return json(200, { pack: p, subscribed: p.sourceCount, ingestQueued: 0 });
    });
    this.on('POST', '/v1/sources/packs/:packId/disable', ({ params }) => {
      const p = s().packs.find((x) => x.id === params.packId);
      if (!p) return notFound('Pack not found');
      p.enabled = false;
      return json(200, { pack: p, unsubscribed: p.sourceCount });
    });
    this.on('POST', '/v1/sources/detect', ({ body }) => {
      const url = (body as { url?: string } | undefined)?.url;
      if (!url) return err(400, 'VALIDATION', 'Invalid request', { location: 'body' });
      return json(200, this.detectFor(url));
    });
    this.on('GET', '/v1/sources/credits', () => json(200, { ...s().credits, date: utcDate() }));
    this.on('GET', '/v1/sources/:id', ({ params }) => {
      const src = s().sources.find((x) => x.id === params.id);
      return src ? json(200, { source: src }) : notFound('Source not found');
    });
    this.on('PATCH', '/v1/sources/:id', ({ params, body }) => {
      const i = s().sources.findIndex((x) => x.id === params.id);
      if (i < 0) return notFound('Source not found');
      s().sources[i] = { ...s().sources[i]!, ...(body as object), updatedAt: new Date() };
      return json(200, { source: s().sources[i] });
    });
    this.on('DELETE', '/v1/sources/:id', ({ params }) => {
      const before = s().sources.length;
      s().sources = s().sources.filter((x) => x.id !== params.id);
      return before === s().sources.length ? notFound('Source not found') : json(204);
    });

    // Feed & listings
    this.on('GET', '/v1/feed', ({ url }) => this.feedPage(url));
    this.on('GET', '/v1/feed/summary', () => {
      const f = s().feed;
      const saved = [...s().interactions.values()].filter((i) => i.saved).length;
      return json(200, {
        total: f.total,
        byType: {},
        deadlinesThisWeek: Math.min(3, f.total),
        newSinceLastVisit: Math.min(9, f.total),
        lastSeenFeedAt: new Date(Date.now() - 2 * 86_400_000),
        saved,
        warmingUp: f.warmingUp,
      });
    });
    this.on('POST', '/v1/feed/seen', () => json(204));
    this.on('GET', '/v1/listings/:id', ({ params }) => {
      const item = this.findItem(params.id ?? '');
      if (!item) return notFound('Listing not found');
      const it = this.withInteraction(item);
      return json(200, {
        listing: it.listing,
        descriptionHtml: `<p>${escapeHtml(it.listing.descriptionMd)}</p>`,
        fit: it.fit,
        matchedSkills: it.fit?.details.skills.matchedRequired ?? [],
        missingSkills: it.fit?.details.skills.missingRequired ?? [],
        saved: it.saved,
        hidden: it.hidden,
        trackerItemId: it.trackerItemId,
        source: {
          id: it.listing.sourceId,
          name: 'Northwind Labs',
          kind: 'greenhouse',
          scope: 'community',
        },
        applyLinkHealth: { status: 'ok', httpStatus: 200, checkedAt: new Date(), reasons: [] },
        similar: [],
      });
    });
    for (const action of ['save', 'unsave', 'hide', 'unhide'] as const) {
      this.on('POST', `/v1/listings/:id/${action}`, ({ params }) => {
        const id = params.id ?? '';
        if (!this.findItem(id)) return notFound('Listing not found');
        const cur = s().interactions.get(id) ?? { saved: false, hidden: false };
        const next = {
          saved: action === 'save' ? true : action === 'unsave' ? false : cur.saved,
          hidden: action === 'hide' ? true : action === 'unhide' ? false : cur.hidden,
        };
        s().interactions.set(id, next);
        return json(200, { listingId: id, ...next });
      });
    }
    this.on('POST', '/v1/listings/:id/explain', ({ params }) => {
      const item = this.findItem(params.id ?? '');
      if (!item) return notFound('Listing not found');
      const ai = s().settings.ai;
      const deterministic = !ai.enabled || (s().session?.aiMode === 'byok' && !ai.hasKey);
      return json(200, {
        listingId: item.listing.id,
        profileHash: 'e2e',
        source: deterministic ? 'deterministic' : 'llm',
        whyFit: item.fit?.explain.whyFit.slice(0, 3) ?? [],
        gaps: item.fit?.explain.gaps.slice(0, 2) ?? [],
        tailoringTips: deterministic
          ? []
          : ['Lead with the MERN project; it maps to 3 required skills.'],
        generatedAt: new Date(),
      });
    });

    // Tracker
    this.on('GET', '/v1/tracker', ({ url }) => {
      const stage = url.searchParams.get('stage');
      const items = sortTracker(s().tracker).filter((t) => !stage || t.stage === stage);
      return json(200, { items });
    });
    this.on('POST', '/v1/tracker', ({ body }) => {
      const b = (body ?? {}) as {
        listingId?: string;
        stage?: TrackerStage;
        manual?: { title: string; company: string };
      };
      const st = s();
      if (b.listingId) {
        const dup = st.tracker.find((t) => t.listingId === b.listingId);
        if (dup) return err(409, 'CONFLICT', 'Already tracked', { existingId: dup.id });
        const item = this.findItem(b.listingId);
        if (!item) return notFound('Listing not found');
      }
      const listing = b.listingId ? this.findItem(b.listingId)!.listing : null;
      const stage = b.stage ?? 'saved';
      for (const t of st.tracker) if (t.stage === stage) t.position += 1;
      const at = new Date();
      const item = {
        id: hexId(0x33, st.tracker.length + 100),
        userId: st.session!.id,
        listingId: listing?.id ?? null,
        title: listing?.title ?? b.manual?.title ?? 'Untitled',
        company: listing?.company ?? b.manual?.company ?? '',
        type: listing?.type ?? null,
        applyUrl: listing?.applyUrl ?? null,
        deadlineAt: listing?.deadlineAt ?? null,
        sourceId: listing?.sourceId ?? null,
        stage,
        position: 0,
        notes: '',
        contacts: [],
        documents: [],
        appliedAt: stage === 'applied' ? at : null,
        lastActivityAt: at,
        nudges: [],
        createdAt: at,
        updatedAt: at,
        history: [{ stage, at }],
      } as TrackerItemDTO;
      st.tracker.push(item);
      return json(201, { item });
    });
    this.on('GET', '/v1/tracker/analytics', () => {
      const t = s().tracker;
      const counts = Object.fromEntries(
        STAGES.map((st) => [st, t.filter((x) => x.stage === st).length]),
      );
      return json(200, {
        total: t.length,
        applied: t.filter((x) => x.appliedAt).length,
        responded: 0,
        responseRate: 0,
        medianResponseDays: null,
        stageCounts: counts,
        bestSources: [],
        followUp: [],
        moveOn: [],
      });
    });
    this.on('GET', '/v1/tracker/:id', ({ params }) => {
      const item = s().tracker.find((t) => t.id === params.id);
      return item ? json(200, { item }) : notFound('Tracker item not found');
    });
    this.on('PATCH', '/v1/tracker/:id', ({ params, body }) => {
      const item = s().tracker.find((t) => t.id === params.id);
      if (!item) return notFound('Tracker item not found');
      Object.assign(item, body as object, { updatedAt: new Date() });
      return json(200, { item });
    });
    this.on('POST', '/v1/tracker/:id/move', ({ params, body }) => {
      const b = (body ?? {}) as { stage?: TrackerStage; position?: number };
      const item = s().tracker.find((t) => t.id === params.id);
      if (!item) return notFound('Tracker item not found');
      if (
        !b.stage ||
        !STAGES.includes(b.stage) ||
        typeof b.position !== 'number' ||
        b.position < 0
      ) {
        return err(400, 'VALIDATION', 'Invalid request', { location: 'body' });
      }
      const from = item.stage;
      const dest = sortTracker(s().tracker.filter((t) => t.stage === b.stage && t.id !== item.id));
      dest.splice(Math.min(b.position, dest.length), 0, item);
      if (from !== b.stage) {
        item.history.push({ stage: b.stage, at: new Date() });
        if (b.stage === 'applied' && !item.appliedAt) item.appliedAt = new Date();
      }
      item.stage = b.stage;
      item.lastActivityAt = new Date();
      dest.forEach((t, i) => (t.position = i));
      sortTracker(s().tracker.filter((t) => t.stage === from)).forEach((t, i) => (t.position = i));
      return json(200, { item, column: dest.map((t) => ({ id: t.id, position: t.position })) });
    });
    this.on('DELETE', '/v1/tracker/:id', ({ params }) => {
      const before = s().tracker.length;
      s().tracker = s().tracker.filter((t) => t.id !== params.id);
      return before === s().tracker.length ? notFound('Tracker item not found') : json(204);
    });

    // Alerts & push
    this.on('GET', '/v1/alerts', () => json(200, { items: s().alerts }));
    this.on('POST', '/v1/alerts', ({ body }) => {
      const at = new Date();
      const rule = {
        id: hexId(0x55, s().alerts.length + 1),
        userId: s().session!.id,
        enabled: true,
        lastTriggeredAt: null,
        createdAt: at,
        updatedAt: at,
        ...(body as object),
      } as AlertRule;
      s().alerts.push(rule);
      return json(201, { rule });
    });
    this.on('GET', '/v1/alerts/:id', ({ params }) => {
      const rule = s().alerts.find((a) => a.id === params.id);
      return rule ? json(200, { rule }) : notFound('Alert rule not found');
    });
    this.on('PATCH', '/v1/alerts/:id', ({ params, body }) => {
      const rule = s().alerts.find((a) => a.id === params.id);
      if (!rule) return notFound('Alert rule not found');
      Object.assign(rule, body as object, { updatedAt: new Date() });
      return json(200, { rule });
    });
    this.on('DELETE', '/v1/alerts/:id', ({ params }) => {
      const before = s().alerts.length;
      s().alerts = s().alerts.filter((a) => a.id !== params.id);
      return before === s().alerts.length ? notFound('Alert rule not found') : json(204);
    });
    this.on('POST', '/v1/alerts/:id/test', ({ params }) =>
      s().alerts.some((a) => a.id === params.id)
        ? json(202, { queued: true, jobId: 'e2e-job' })
        : notFound('Alert rule not found'),
    );
    this.on('GET', '/v1/push/vapid-public-key', () =>
      json(200, {
        publicKey:
          'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
      }),
    );
    this.on('GET', '/v1/push/subscriptions', () => json(200, { items: [] }));
    this.on('POST', '/v1/push/subscriptions', ({ body }) =>
      json(201, {
        subscription: {
          id: hexId(0x66, 1),
          endpoint: (body as { endpoint?: string })?.endpoint ?? '',
          userAgent: 'e2e',
          createdAt: new Date(),
        },
      }),
    );
    this.on('DELETE', '/v1/push/subscriptions', () => json(204));
    this.on('DELETE', '/v1/push/subscriptions/:id', () => json(204));

    // Notifications
    this.on('GET', '/v1/notifications', ({ url }) => {
      const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
      const items = s().notifications.filter((n) => !unreadOnly || !n.readAt);
      return json(200, {
        items,
        nextCursor: null,
        unreadCount: s().notifications.filter((n) => !n.readAt).length,
      });
    });
    this.on('POST', '/v1/notifications/read', ({ body }) => {
      const b = (body ?? {}) as { ids?: string[]; all?: boolean };
      let updated = 0;
      for (const n of s().notifications) {
        if (!n.readAt && (b.all || b.ids?.includes(n.id))) {
          n.readAt = new Date();
          updated += 1;
        }
      }
      return json(200, { updated, unreadCount: s().notifications.filter((n) => !n.readAt).length });
    });

    // Settings & account
    this.on('GET', '/v1/settings', () => json(200, s().settings));
    this.on('PATCH', '/v1/settings', ({ body }) => {
      const b = (body ?? {}) as Record<string, Record<string, unknown> | undefined>;
      const cur = s().settings as unknown as Record<string, Record<string, unknown>>;
      for (const key of ['appearance', 'ai', 'notifications', 'privacy', 'weights']) {
        const patch = b[key];
        if (patch) cur[key] = { ...cur[key], ...patch };
      }
      return json(200, s().settings);
    });
    this.on('PUT', '/v1/settings/ai', ({ body }) => {
      const b = (body ?? {}) as {
        provider?: string;
        baseUrl?: string | null;
        model?: string | null;
        apiKey?: string;
        enabled?: boolean;
      };
      const ai = s().settings.ai;
      Object.assign(ai, {
        provider: b.provider ?? ai.provider,
        baseUrl: b.baseUrl ?? ai.baseUrl,
        model: b.model ?? ai.model,
        enabled: b.enabled ?? ai.enabled,
        ...(b.apiKey ? { hasKey: true, keyLast4: b.apiKey.slice(-4) } : {}),
      });
      return json(200, { ai });
    });
    this.on('POST', '/v1/settings/ai/test', () =>
      json(200, {
        ok: true,
        latencyMs: 214,
        model: s().settings.ai.model ?? 'default',
        provider: s().settings.ai.provider,
      }),
    );
    this.on('DELETE', '/v1/settings/ai/key', () => {
      const st = s();
      st.settings.ai = {
        ...st.settings.ai,
        hasKey: false,
        keyLast4: null,
        provider: 'default',
        baseUrl: null,
        model: null,
        enabled: st.session?.aiMode === 'beacon',
      };
      return json(200, { ai: st.settings.ai });
    });
    this.on('PUT', '/v1/settings/weights', ({ body }) =>
      json(200, { weights: body, normalised: body }),
    );
    this.on('GET', '/v1/settings/export', () =>
      json(
        200,
        { exportedAt: new Date(), user: s().session },
        { 'content-disposition': `attachment; filename="beacon-export-${utcDate()}.json"` },
      ),
    );
    this.on('DELETE', '/v1/account', () => {
      s().session = null;
      return json(204);
    });
  }

  // ── Route helpers ────────────────────────────────────────────────────────

  private me() {
    const st = this.state;
    const u = st.session!;
    const ai = st.settings.ai;
    return {
      user: { ...publicUser(u), lastSeenFeedAt: new Date(Date.now() - 2 * 86_400_000) },
      onboarding: {
        step: u.onboardingStep,
        completedAt: u.onboardingStep === 'done' ? u.createdAt : null,
        consent: u.aiMode
          ? {
              version: '2026-10-27',
              aiMode: u.aiMode,
              resumeToAi: u.aiMode === 'beacon',
              at: u.createdAt,
            }
          : null,
        hasProfile: st.profile !== null,
        hasResume: st.hasResume,
        personalSources: st.sources.filter((x) => x.scope === 'personal').length,
        enabledPacks: st.packs.filter((p) => p.enabled).map((p) => p.id),
      },
      settings: {
        ...st.settings.appearance,
        aiEnabled: ai.enabled,
        aiProvider: ai.provider,
        hasKey: ai.hasKey,
        consentGivenAt: ai.consentGivenAt,
        pushEnabled: st.settings.notifications.push,
        timezone: st.settings.notifications.timezone,
      },
      unreadNotifications: st.notifications.filter((n) => !n.readAt).length,
    };
  }

  private profileResponse() {
    const st = this.state;
    return {
      profile: st.profile ?? emptyProfile(st.session!.id),
      exists: st.profile !== null,
      profileHash: st.profile ? 'e2e-profile-hash' : null,
      resume: st.hasResume
        ? {
            fileName: 'resume.pdf',
            mimeType: 'application/pdf',
            size: 182_044,
            textChars: 3200,
            uploadedAt: new Date(),
            parsedFrom: 'deterministic',
          }
        : null,
    };
  }

  private detectFor(input: string): DetectResult {
    const hit = this.state.detect.get(normaliseInputUrl(input));
    if (hit) return hit;
    const url = /^https?:\/\//.test(input) ? input : `https://${input}`;
    const gh = /boards\.greenhouse\.io\/([^/?#]+)/.exec(url);
    if (gh?.[1]) {
      return {
        url,
        kind: 'greenhouse',
        confidence: 0.99,
        boardToken: gh[1],
        company: gh[1],
        name: `${gh[1]} careers`,
        previewCount: 142,
        sampleTitles: [
          'Software Engineer Intern',
          'Data Engineer Intern',
          'Product Manager Intern',
        ],
        costsCredits: false,
        message: null,
        valid: true,
        apiUrl: `https://boards-api.greenhouse.io/v1/boards/${gh[1]}/jobs`,
        companyName: gh[1],
        companyDomain: null,
        finalUrl: null,
        config: { boardToken: gh[1], feedUrl: null, provider: null },
      };
    }
    return {
      url,
      kind: 'firecrawl',
      confidence: 0.4,
      boardToken: null,
      company: null,
      name: new URL(url).hostname,
      previewCount: null,
      sampleTitles: [],
      costsCredits: true,
      message: "No job board API here. We'll read the page instead (uses crawl credits).",
      valid: true,
      apiUrl: null,
      companyName: null,
      companyDomain: new URL(url).hostname,
      finalUrl: null,
      config: { boardToken: null, feedUrl: null, provider: null },
    };
  }

  private withInteraction(item: FeedItemDTO): FeedItemDTO {
    const i = this.state.interactions.get(item.listing.id);
    const tracked = this.state.tracker.find((t) => t.listingId === item.listing.id);
    return {
      ...item,
      saved: i?.saved ?? item.saved,
      hidden: i?.hidden ?? item.hidden,
      trackerItemId: tracked?.id ?? null,
    };
  }

  private findItem(id: string): FeedItemDTO | undefined {
    const f = this.state.feed;
    const limit = Math.min(f.total, 6000);
    for (let i = 0; i < limit; i++) {
      const it = f.item(i);
      if (it.listing.id === id) return it;
    }
    return undefined;
  }

  private feedPage(url: URL): Reply {
    const st = this.state;
    const limitRaw = url.searchParams.get('limit');
    const limit = limitRaw === null ? 20 : Number(limitRaw);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return json(400, {
        error: {
          code: 'VALIDATION',
          message: 'Invalid request',
          issues: [{ path: ['limit'], code: 'too_big', message: 'Expected 1..100' }],
          details: { location: 'query' },
        },
      });
    }
    const offset = decodeCursor(url.searchParams.get('cursor'));
    if (offset === null) return err(400, 'BAD_CURSOR', 'Cursor does not decode');
    const hideHidden =
      url.searchParams.get('includeHidden') !== 'true' &&
      url.searchParams.get('hideHidden') !== 'false';
    const savedOnly = url.searchParams.get('savedOnly') === 'true';
    const q = url.searchParams.get('q')?.toLowerCase().trim();
    const repeat = st.feed.repeatAcrossPages;
    const items: FeedItemDTO[] =
      repeat && offset > 0 ? [this.withInteraction(repeat(st.feed.item(offset - 1)))] : [];
    const end = Math.min(st.feed.total, offset + limit);
    for (let i = offset; i < end; i++) {
      const it = this.withInteraction(st.feed.item(i));
      if (hideHidden && it.hidden) continue;
      if (savedOnly && !it.saved) continue;
      if (q && !`${it.listing.title} ${it.listing.company}`.toLowerCase().includes(q)) continue;
      items.push(it);
    }
    return json(200, {
      items,
      nextCursor: end < st.feed.total ? encodeCursor(end) : null,
      warmingUp: st.feed.warmingUp,
      ...(offset === 0 ? { total: st.feed.total } : {}),
    });
  }
}

// ── Pure helpers ────────────────────────────────────────────────────────────

function parseBody(req: Request): unknown {
  const raw = req.postData();
  if (!raw) return undefined;
  const type = req.headers()['content-type'] ?? '';
  if (!type.includes('json')) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function publicUser(u: FixtureUser) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatarUrl,
    role: u.role,
    onboardingCompletedAt: u.onboardingStep === 'done' ? u.createdAt : null,
    lastLoginAt: new Date(),
    createdAt: u.createdAt,
    updatedAt: new Date(),
  };
}

function emptyProfile(userId: string) {
  return {
    userId,
    headline: null,
    summary: null,
    skills: [],
    education: [],
    experience: [],
    experienceYears: 0,
    projects: [],
    links: [],
    preferredRoles: [],
    preferredLocations: [],
    remotePref: 'any',
    openToRelocate: false,
    stipendFloor: null,
    workAuth: { citizenship: [], authorisedCountries: [], needsSponsorship: false },
    languages: [],
    opportunityTypes: [],
    embeddingHash: null,
  };
}

function sortTracker(items: TrackerItemDTO[]): TrackerItemDTO[] {
  return [...items].sort(
    (a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || a.position - b.position,
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export { createState, feedItem, fixtureUsers };
