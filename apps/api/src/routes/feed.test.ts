import type { Types } from 'mongoose';
import { beforeEach, describe, expect, it } from 'vitest';

import { DAY_MS, EMBEDDING_DIM } from '@kestrel/shared';

import { invalidateVectorCache } from '../lib/vector.js';
import { Interaction, Match } from '../models/activity.js';
import { Profile } from '../models/profile.js';
import { User } from '../models/user.js';
import {
  as,
  buildTestApp,
  createListing,
  createSource,
  createUser,
  resetDb,
} from '../test/helpers.js';

interface FeedItem {
  listing: { id: string; title: string; deadlineAt: string | null };
  score: number | null;
  saved: boolean;
  hidden: boolean;
}

/** A unit vector along `axis`, slightly tilted toward axis 0 so cosines are distinct. */
function vector(axis: number, tilt = 0.1): number[] {
  const v = new Array<number>(EMBEDDING_DIM).fill(0);
  v[axis] = 1;
  v[0] = (v[0] ?? 0) + tilt;
  return v;
}

async function scored(
  userId: Types.ObjectId,
  scores: number[],
  extra: Parameters<typeof createListing>[0] = {},
) {
  const source = await createSource({ scope: 'community' });
  const listings = [];
  for (const [i, score] of scores.entries()) {
    const listing = await createListing({
      sourceId: source._id,
      title: `Listing ${i} (${score})`,
      deadlineAt: new Date(Date.now() + (i + 2) * DAY_MS),
      ...extra,
    });
    await Match.create({
      userId,
      listingId: listing._id,
      score,
      details: {
        skills: {
          matchedRequired: ['React'],
          missingRequired: ['Go'],
          matchedNice: [],
          missingNice: [],
        },
        roleFamily: null,
      },
      explain: { whyFit: ['Uses React'], gaps: ['Go'] },
    });
    listings.push(listing);
  }
  return { source, listings };
}

describe('feed and listings', () => {
  beforeEach(async () => {
    await resetDb();
    invalidateVectorCache();
  });

  it('warm feed: sort=fit pages by score with a keyset cursor and no duplicates', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    await scored(user._id, [55, 91, 73, 91, 12, 88]);
    const api = as(app, user);

    const first = await api.get('/v1/feed?limit=2');
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ warmingUp: false, total: 6 });
    const scores: number[] = first.body.items.map((i: FeedItem) => i.score);
    const ids = new Set<string>(first.body.items.map((i: FeedItem) => i.listing.id));
    let cursor = first.body.nextCursor as string | null;
    while (cursor) {
      const next = await api.get(`/v1/feed?limit=2&cursor=${cursor}`);
      expect(next.status).toBe(200);
      expect(next.body.total).toBeUndefined();
      for (const item of next.body.items as FeedItem[]) {
        expect(ids.has(item.listing.id)).toBe(false);
        ids.add(item.listing.id);
        scores.push(item.score!);
      }
      cursor = next.body.nextCursor;
    }
    expect(scores).toEqual([91, 91, 88, 73, 55, 12]);
    expect(first.body.items[0].fit).toMatchObject({
      score: 91,
      explain: { whyFit: ['Uses React'] },
    });

    expect((await api.get('/v1/feed?minFit=80')).body.items).toHaveLength(3);
    expect((await api.get('/v1/feed?minFit=80')).body.total).toBe(3);
  });

  it('warm feed: deadline sort, filters, hidden/saved and cursor errors', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const { listings } = await scored(user._id, [40, 80, 60]);
    await scored(user._id, [99], { type: 'hackathon', title: 'Hack Night' });
    const api = as(app, user);

    const byDeadline = await api.get('/v1/feed?sort=deadline');
    const deadlines = byDeadline.body.items.map((i: FeedItem) => Date.parse(i.listing.deadlineAt!));
    expect([...deadlines].sort((a, b) => a - b)).toEqual(deadlines);

    expect(
      (await api.get('/v1/feed?types=hackathon')).body.items.map((i: FeedItem) => i.listing.title),
    ).toEqual(['Hack Night']);
    expect((await api.get('/v1/feed?q=hack')).body.items).toHaveLength(1);

    const hideId = listings[1]!._id.toString();
    expect((await api.post(`/v1/listings/${hideId}/hide`)).body).toEqual({
      listingId: hideId,
      saved: false,
      hidden: true,
      trackerItemId: null,
      tracker: null,
    });
    expect((await api.get('/v1/feed')).body.items.map((i: FeedItem) => i.listing.id)).not.toContain(
      hideId,
    );
    const withHidden = await api.get('/v1/feed?includeHidden=true');
    expect(withHidden.body.items.find((i: FeedItem) => i.listing.id === hideId)?.hidden).toBe(true);
    expect((await api.post(`/v1/listings/${hideId}/unhide`)).body.hidden).toBe(false);

    const saveId = listings[0]!._id.toString();
    expect((await api.post(`/v1/listings/${saveId}/save`)).body.saved).toBe(true);
    const savedOnly = await api.get('/v1/feed?savedOnly=true');
    expect(savedOnly.body.items.map((i: FeedItem) => i.listing.id)).toEqual([saveId]);
    expect(
      (await Interaction.findOne({ userId: user._id, listingId: listings[0]!._id }).lean())
        ?.savedAt,
    ).toBeInstanceOf(Date);
    expect((await api.post(`/v1/listings/${saveId}/unsave`)).body).toEqual({
      listingId: saveId,
      saved: false,
      hidden: false,
      trackerItemId: null,
      tracker: null,
    });

    const page = await api.get('/v1/feed?limit=1');
    const wrongSort = await api.get(
      `/v1/feed?sort=posted&cursor=${page.body.nextCursor as string}`,
    );
    expect(wrongSort.status).toBe(400);
    expect(wrongSort.body.error.code).toBe('BAD_CURSOR');
    expect((await api.get('/v1/feed?cursor=%%%')).status).toBe(400);
    expect((await api.get('/v1/feed?limit=0')).body.error.code).toBe('VALIDATION');
  });

  it('cold start ranks by the profile embedding (memory vector search) with warmingUp', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const source = await createSource({ scope: 'community' });
    const near = await createListing({ sourceId: source._id, title: 'Near', embedding: vector(5) });
    const far = await createListing({
      sourceId: source._id,
      title: 'Far',
      embedding: vector(9, 0.9),
    });
    await createListing({ sourceId: source._id, title: 'No embedding' });
    await Profile.create({ userId: user._id, profileHash: 'h', embedding: vector(5) });
    const res = await as(app, user).get('/v1/feed?limit=1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ warmingUp: true, total: 2 });
    expect(res.body.items[0]).toMatchObject({
      listing: { id: near._id.toString() },
      fit: null,
      score: null,
    });
    const next = await as(app, user).get(
      `/v1/feed?limit=1&cursor=${res.body.nextCursor as string}`,
    );
    expect(next.body.items[0].listing.id).toBe(far._id.toString());
    expect(next.body.nextCursor).toBeNull();
    // Deadline sort on the cold path uses listing order, not vectors.
    expect((await as(app, user).get('/v1/feed?sort=deadline')).body.items).toHaveLength(3);
  });

  it('POST /v1/feed/seen stamps lastSeenFeedAt; the summary counts only newer listings', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const source = await createSource({ scope: 'community' });
    await createListing({ sourceId: source._id, firstSeenAt: new Date(Date.now() - 2 * DAY_MS) });
    const api = as(app, user);
    expect((await api.get('/v1/feed/summary')).body).toMatchObject({
      total: 1,
      newSinceLastVisit: 1,
      warmingUp: true,
    });
    expect((await api.post('/v1/feed/seen')).status).toBe(204);
    const stamped = await User.findById(user._id).lean();
    expect(stamped?.lastSeenFeedAt).toBeInstanceOf(Date);
    await createListing({ sourceId: source._id, firstSeenAt: new Date(Date.now() + 1_000) });
    const summary = await api.get('/v1/feed/summary');
    expect(summary.body).toMatchObject({ total: 2, newSinceLastVisit: 1 });
    expect(summary.body.lastSeenFeedAt).toEqual(stamped?.lastSeenFeedAt?.toISOString());
  });

  it('GET /v1/listings/:id returns the match fit, skills, source and sanitised HTML', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const { listings, source } = await scored(user._id, [77], {
      descriptionMd: '## Role\n\n<script>alert(1)</script>\n\n**Build** [docs](https://acme.dev)',
    });
    const res = await as(app, user).get(`/v1/listings/${listings[0]!._id.toString()}`);
    expect(res.status).toBe(200);
    expect(res.body.fit.score).toBe(77);
    expect(res.body.matchedSkills).toEqual(['React']);
    expect(res.body.missingSkills).toEqual(['Go']);
    expect(res.body.source).toMatchObject({ id: source._id.toString(), scope: 'community' });
    expect(res.body.descriptionHtml).toContain('<strong>Build</strong>');
    expect(res.body.descriptionHtml).not.toContain('<script>');
    expect(res.body.descriptionHtml).toContain('rel="noopener noreferrer nofollow"');
    expect(res.body.applyLinkHealth).toMatchObject({ status: 'unknown' });
    expect((await as(app, user).get('/v1/listings/0123456789abcdef01234567')).status).toBe(404);
  });
});
