import type { Types } from 'mongoose';
import { beforeEach, describe, expect, it } from 'vitest';

import { DAY_MS } from '@kestrel/shared';

import { Match, TrackerItem } from '../models/activity.js';
import {
  as,
  buildTestApp,
  createListing,
  createSource,
  createUser,
  resetDb,
} from '../test/helpers.js';

/** docs/SHARED-REQUESTS.md "ux-spec → api": facets, hints, save = tracker, tracker on items, follow-ups. */
describe('radar state for the restructured UX', () => {
  beforeEach(resetDb);

  const days = (n: number) => new Date(Date.now() + n * DAY_MS);

  async function seed(userId: Types.ObjectId) {
    const source = await createSource({ scope: 'community' });
    const rows = [
      {
        type: 'internship',
        remote: 'remote',
        deadlineAt: days(3),
        postedAt: days(-0.5),
        score: 92,
      },
      { type: 'internship', remote: 'onsite', deadlineAt: days(10), postedAt: days(-3), score: 75 },
      {
        type: 'internship',
        remote: 'remote',
        deadlineAt: days(25),
        postedAt: days(-20),
        score: 45,
      },
      { type: 'hackathon', remote: 'remote', deadlineAt: null, postedAt: days(-40), score: 81 },
      { type: 'fulltime', remote: 'hybrid', deadlineAt: days(60), postedAt: days(-6), score: 20 },
    ] as const;
    const listings = [];
    for (const [i, r] of rows.entries()) {
      const listing = await createListing({
        sourceId: source._id,
        title: `Row ${i}`,
        type: r.type,
        remote: r.remote,
        deadlineAt: r.deadlineAt,
        postedAt: r.postedAt,
      });
      await Match.create({ userId, listingId: listing._id, score: r.score });
      listings.push(listing);
    }
    return { source, listings };
  }

  it('GET /v1/feed/facets: conditional counts per option (each facet ignores only its own filter)', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    await seed(user._id);
    const api = as(app, user);

    const all = await api.get('/v1/feed/facets');
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({
      warmingUp: false,
      total: 5,
      types: { internship: 3, hackathon: 1, fulltime: 1, scholarship: 0 },
      remote: { remote: 3, onsite: 1, hybrid: 1, unknown: 0 },
      deadline: {
        within: [
          { days: 7, count: 1 },
          { days: 14, count: 2 },
          { days: 30, count: 3 },
        ],
        none: 1,
      },
      freshness: {
        within: [
          { days: 1, count: 1 },
          { days: 7, count: 3 },
          { days: 30, count: 4 },
        ],
      },
    });
    expect(all.body.fit).toEqual([
      { min: 80, label: 'Strong fit', count: 2 },
      { min: 60, label: 'Good fit', count: 3 },
      { min: 40, label: 'Partial fit', count: 4 },
      { min: 0, label: 'Weak fit', count: 5 },
    ]);

    // types=internship&remote=remote: type counts still apply remote, remote counts still apply type.
    const filtered = await api.get('/v1/feed/facets?types=internship&remote=remote&minFit=60');
    expect(filtered.body.total).toBe(1);
    expect(filtered.body.types).toMatchObject({ internship: 1, hackathon: 1 });
    expect(filtered.body.remote).toMatchObject({ remote: 1, onsite: 1 });
    expect(filtered.body.fit.map((b: { count: number }) => b.count)).toEqual([1, 1, 2, 2]);
    const feed = await api.get('/v1/feed?types=internship&remote=remote&minFit=60');
    expect(feed.body.total).toBe(filtered.body.total);

    expect((await api.get('/v1/feed/facets?minFit=500')).status).toBe(400);
  });

  it('cold start facets count visible listings and leave fit null', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const source = await createSource({ scope: 'community' });
    await createListing({ sourceId: source._id, type: 'research', remote: 'unknown' });
    await createListing({
      sourceId: source._id,
      type: 'research',
      remote: 'remote',
      archived: true,
    });
    const res = await as(app, user).get('/v1/feed/facets');
    expect(res.body).toMatchObject({
      warmingUp: true,
      total: 1,
      fit: null,
      types: { research: 1 },
      remote: { unknown: 1, remote: 0 },
    });
  });

  it('save = tracker: save upserts a `saved` item (idempotent); unsave removes it only while still saved', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const { listings } = await seed(user._id);
    const api = as(app, user);
    const [a, b] = [listings[0]!._id.toString(), listings[1]!._id.toString()];

    const saved = await api.post(`/v1/listings/${a}/save`);
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ listingId: a, saved: true, tracker: { stage: 'saved' } });
    const itemId = saved.body.trackerItemId as string;
    expect(saved.body.tracker.id).toBe(itemId);
    const again = await api.post(`/v1/listings/${a}/save`);
    expect(again.body.trackerItemId).toBe(itemId);
    expect(await TrackerItem.countDocuments({ userId: user._id })).toBe(1);

    const second = await api.post(`/v1/listings/${b}/save`);
    const board = await api.get('/v1/tracker?stage=saved');
    expect(
      board.body.items.map((i: { id: string; position: number }) => [i.id, i.position]),
    ).toEqual([
      [second.body.trackerItemId, 0],
      [itemId, 1],
    ]);
    expect(board.body.items[1]).toMatchObject({
      listingId: a,
      title: 'Row 0',
      history: [{ stage: 'saved' }],
    });

    // Unsave while still saved → the item goes and the column is compacted.
    const unsaved = await api.post(`/v1/listings/${b}/unsave`);
    expect(unsaved.body).toMatchObject({ saved: false, trackerItemId: null, tracker: null });
    expect(
      (await api.get('/v1/tracker?stage=saved')).body.items.map(
        (i: { position: number }) => i.position,
      ),
    ).toEqual([0]);

    // Once the student moved on (applied), unsave keeps the application.
    await api.post(`/v1/tracker/${itemId}/move`).send({ stage: 'applied', position: 0 });
    const kept = await api.post(`/v1/listings/${a}/unsave`);
    expect(kept.body).toMatchObject({
      saved: false,
      trackerItemId: itemId,
      tracker: { id: itemId, stage: 'applied' },
    });
    // Saving a tracked listing never resets its stage.
    expect((await api.post(`/v1/listings/${a}/save`)).body.tracker).toEqual({
      id: itemId,
      stage: 'applied',
    });

    // Tracking directly (POST /v1/tracker) after a save is still a 409 with the existing id.
    const dup = await api.post('/v1/tracker').send({ listingId: a });
    expect(dup.status).toBe(409);
    expect(dup.body.error.details.existingId).toBe(itemId);
  });

  it('feed items and listing detail carry tracker {id, stage}', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const { listings } = await seed(user._id);
    const api = as(app, user);
    const id = listings[0]!._id.toString();
    const { body } = await api.post(`/v1/listings/${id}/save`);
    const feed = await api.get('/v1/feed');
    const item = feed.body.items.find((i: { listing: { id: string } }) => i.listing.id === id);
    expect(item).toMatchObject({
      saved: true,
      trackerItemId: body.trackerItemId,
      tracker: { id: body.trackerItemId, stage: 'saved' },
    });
    const untracked = feed.body.items.find((i: { listing: { id: string } }) => i.listing.id !== id);
    expect(untracked).toMatchObject({ trackerItemId: null, tracker: null });
    const detail = await api.get(`/v1/listings/${id}`);
    expect(detail.body.tracker).toEqual({ id: body.trackerItemId, stage: 'saved' });
  });

  it('GET /v1/feed/summary adds followUpsDue (applied, idle ≥ 10 d) and nextDeadlineAt', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const { listings } = await seed(user._id);
    await TrackerItem.create([
      {
        userId: user._id,
        title: 'quiet',
        company: 'A',
        stage: 'applied',
        lastActivityAt: days(-12),
      },
      {
        userId: user._id,
        title: 'very quiet',
        company: 'B',
        stage: 'applied',
        lastActivityAt: days(-45),
      },
      {
        userId: user._id,
        title: 'recent',
        company: 'C',
        stage: 'applied',
        lastActivityAt: days(-2),
      },
      {
        userId: user._id,
        title: 'interviewing',
        company: 'D',
        stage: 'interview',
        lastActivityAt: days(-20),
      },
    ]);
    const res = await as(app, user).get('/v1/feed/summary');
    expect(res.body.followUpsDue).toBe(2);
    expect(res.body.nextDeadlineAt).toBe(listings[0]!.deadlineAt!.toISOString());
  });

  it('GET/PATCH /v1/settings/hints stores tour, tips and rail state', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const api = as(app, user);
    const fresh = await api.get('/v1/settings/hints');
    expect(fresh.body).toEqual({
      tourDone: false,
      tourStep: null,
      tour: { offeredAt: null, completedAt: null, dismissedAt: null },
      tips: {},
      ui: { railCollapsed: null, radarView: null },
      updatedAt: null,
    });

    const offered = await api
      .patch('/v1/settings/hints')
      .send({ tourOffered: true, tourStep: 2, tips: { 'coach:radar': true, deadlines: true } });
    expect(offered.status).toBe(200);
    expect(offered.body).toMatchObject({ tourDone: false, tourStep: 2 });
    expect(offered.body.tour.offeredAt).toEqual(expect.any(String));
    expect(Object.keys(offered.body.tips).sort()).toEqual(['coach:radar', 'deadlines']);

    const done = await api.patch('/v1/settings/hints').send({
      tourDone: true,
      tips: { deadlines: null },
      ui: { railCollapsed: true, radarView: 'list' },
    });
    expect(done.body).toMatchObject({
      tourDone: true,
      ui: { railCollapsed: true, radarView: 'list' },
    });
    expect(Object.keys(done.body.tips)).toEqual(['coach:radar']);
    const completedAt = done.body.tour.completedAt as string;
    expect(
      (await api.patch('/v1/settings/hints').send({ tourDone: true })).body.tour.completedAt,
    ).toBe(completedAt);
    expect(
      (await api.patch('/v1/settings/hints').send({ tourOffered: true })).body.tour.offeredAt,
    ).toBe(offered.body.tour.offeredAt);

    // "Show me around" replays the tour.
    const replay = await api.patch('/v1/settings/hints').send({ tourDone: false, tourStep: 0 });
    expect(replay.body).toMatchObject({
      tourDone: false,
      tourStep: 0,
      tour: { completedAt: null, dismissedAt: null },
    });
    expect(
      (await api.patch('/v1/settings/hints').send({ tourDismissed: true })).body.tourDone,
    ).toBe(true);
    expect((await api.get('/v1/settings/hints')).body.tips).toHaveProperty('coach:radar');

    const stamped = await api
      .patch('/v1/settings/hints')
      .send({ tips: { welcome: '2026-10-01T10:00:00.000Z' } });
    expect(stamped.body.tips.welcome).toBe('2026-10-01T10:00:00.000Z');
    for (const bad of [
      {},
      { tips: { welcome: false } },
      { tips: { welcome: 5 } },
      { tips: { 'Bad.Id': true } },
      { ui: { radarView: 'kanban' } },
      { tourStep: 'Has Spaces' },
      { extra: 1 },
    ]) {
      expect((await api.patch('/v1/settings/hints').send(bad)).status, JSON.stringify(bad)).toBe(
        400,
      );
    }
    // GET /v1/settings is unchanged by hints.
    expect((await api.get('/v1/settings')).body).not.toHaveProperty('hints');
  });
});
