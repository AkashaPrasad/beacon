import nock from 'nock';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { SourceError } from '../../lib/errors.js';
import { sample, testCtx, testSource } from '../../test/samples.js';

import { fetchPublicApi, resolvePublicApi } from './index.js';

beforeAll(() => nock.disableNetConnect());
afterEach(() => {
  nock.cleanAll();
});
afterAll(() => nock.enableNetConnect());

const src = (url: string, provider: string | null = null, extra: Record<string, unknown> = {}) =>
  testSource({ kind: 'publicapi', url, name: url, config: { boardToken: null, feedUrl: null, provider, ...extra } });

describe('provider resolution', () => {
  it('resolves provider + feed from the page URL', () => {
    expect(resolvePublicApi(src('https://devpost.com/hackathons'))).toEqual({
      provider: 'devpost',
      feedUrl: 'https://devpost.com/api/hackathons?status[]=upcoming&status[]=open',
    });
    expect(resolvePublicApi(src('https://unstop.com/internships')).feedUrl).toContain('opportunity=internships');
    expect(() => resolvePublicApi(src('https://example.com/jobs'))).toThrow(SourceError);
  });
});

describe('job APIs', () => {
  it('remotive', async () => {
    nock('https://remotive.com').get('/api/remote-jobs').query({ category: 'software-dev' }).reply(200, sample('remotive'));
    const res = await fetchPublicApi(src('https://remotive.com/remote-jobs'), testCtx());
    expect(res.listings).toHaveLength(2);
    const j = res.listings[0]!;
    expect(j.title).toBe('AI Trainer - Video Annotation');
    expect(j.company).toBe('iMerit Technology');
    expect(j.remote).toBe('remote');
    expect(j.currency).toBe('USD');
    expect(j.postedAt?.toISOString()).toBe('2026-10-22T18:40:19.000Z');
  });

  it('arbeitnow', async () => {
    nock('https://www.arbeitnow.com').get('/api/job-board-api').reply(200, sample('arbeitnow'));
    const res = await fetchPublicApi(src('https://www.arbeitnow.com/'), testCtx());
    expect(res.listings).toHaveLength(2);
    expect(res.listings[0]!.location).toEqual(['Bochum']);
    expect(res.listings[0]!.postedAt).toBeInstanceOf(Date);
  });

  it('remoteok skips the legal element and sends a User-Agent', async () => {
    nock('https://remoteok.com', { reqheaders: { 'user-agent': /BeaconBot/ } })
      .get('/api')
      .reply(200, sample('remoteok'));
    const res = await fetchPublicApi(src('https://remoteok.com/'), testCtx());
    expect(res.listings.length).toBe(2);
    expect(res.listings[0]!.title).toBe('Account Executive');
    expect(res.listings[0]!.stipendMin).toBeNull();
  });

  it('jobicy with disclosed salary', async () => {
    nock('https://jobicy.com').get('/api/v2/remote-jobs').query(true).reply(200, sample('jobicy'));
    const res = await fetchPublicApi(src('https://jobicy.com/'), testCtx());
    expect(res.listings).toHaveLength(2);
    const paid = res.listings.find((l) => l.stipendMin !== null)!;
    expect(paid).toMatchObject({ stipendMin: 219989, currency: 'USD', period: 'year' });
  });

  it('the muse (internship level → internship type)', async () => {
    const body = { ...sample<Record<string, unknown>>('themuse'), page_count: 1 };
    nock('https://www.themuse.com').get('/api/public/jobs').query(true).reply(200, body);
    const res = await fetchPublicApi(src('https://www.themuse.com/jobs'), testCtx());
    expect(res.listings).toHaveLength(2);
    expect(res.listings[0]!.type).toBe('internship');
    expect(res.listings[0]!.company).toBe('Walmart');
  });

  it('adzuna requires keys', async () => {
    const err = await fetchPublicApi(src('https://api.adzuna.com/v1/api/jobs/in/search/1'), testCtx()).catch((e: unknown) => e);
    expect((err as SourceError).kind).toBe('auth');
  });
});

describe('hackathon APIs', () => {
  it('devpost pages and parses display date ranges via the shared deadline parser', async () => {
    const page = sample<{ hackathons: unknown[]; meta: Record<string, unknown> }>('devpost');
    nock('https://devpost.com')
      .get('/api/hackathons')
      .query((q) => q.page === '1')
      .reply(200, { ...page, meta: { total_count: 2, per_page: 2 } });
    const res = await fetchPublicApi(src('https://devpost.com/hackathons', 'devpost'), testCtx());
    expect(res.listings).toHaveLength(2);
    const h = res.listings[0]!;
    expect(h.type).toBe('hackathon');
    expect(h.title).toBe('Nebius x NVIDIA Global AI Hackathon');
    expect(h.remote).toBe('remote');
    // "Aug 26 - Oct 30, 2026" → end of Oct 30 in IST.
    expect(h.deadlineAt?.toISOString()).toBe('2026-10-30T18:29:59.999Z');
    expect(h.deadlineKind).toBe('date');
    expect(h.descriptionMd).toContain('$50,000');
    expect(res.listings[1]!.deadlineAt?.toISOString()).toBe('2026-11-12T18:29:59.999Z');
  });

  it('devfolio POST search', async () => {
    let body: unknown;
    nock('https://api.devfolio.co')
      .post('/api/search/hackathons', (b: unknown) => {
        body = b;
        return true;
      })
      .reply(200, sample('devfolio'));
    const res = await fetchPublicApi(src('https://devfolio.co/hackathons', 'devfolio', { feedUrl: 'https://api.devfolio.co/api/search/hackathons' }), testCtx());
    expect(body).toEqual({ type: 'application_open', from: 0, size: 20 });
    expect(res.listings).toHaveLength(2);
    const h = res.listings[0]!;
    expect(h.title).toBe('Surat Hack 2026');
    expect(h.applyUrl).toBe('https://surat-hack-2026.devfolio.co/');
    expect(h.deadlineAt?.toISOString()).toBe('2026-10-28T18:30:00.000Z');
    expect(h.country).toBe('IN');
  });

  it('unstop', async () => {
    const body = sample<{ data: Record<string, unknown> }>('unstop');
    nock('https://unstop.com')
      .get('/api/public/opportunity/search-result')
      .query(true)
      .reply(200, { data: { ...body.data, current_page: 1, last_page: 1 } });
    const res = await fetchPublicApi(src('https://unstop.com/hackathons'), testCtx());
    expect(res.listings).toHaveLength(2);
    const h = res.listings[0]!;
    expect(h.title).toBe('Hacksprint 3.0');
    expect(h.company).toBe('Karpagam Academy of Higher Education');
    expect(h.deadlineAt?.toISOString()).toBe('2026-12-28T18:29:05.000Z');
    expect(h.eligibility.other).toContain('Engineering Students');
    expect(h.skillsRequired).toContain('Problem Solving');
    expect(res.listings[1]!.location[0]).toContain('Pune');
  });

  it('hackerearth', async () => {
    nock('https://www.hackerearth.com').get('/chrome-extension/events/').reply(200, sample('hackerearth'));
    const res = await fetchPublicApi(src('https://www.hackerearth.com/challenges/hackathon/'), testCtx());
    expect(res.listings).toHaveLength(2);
    expect(res.listings[0]!.deadlineAt?.toISOString()).toBe('2026-11-06T18:29:00.000Z');
    expect(res.listings[0]!.descriptionMd).toContain('AI &');
  });

  it('kaggle POST ListCompetitions', async () => {
    let body: { pageSize?: number } | undefined;
    nock('https://www.kaggle.com')
      .post('/api/i/competitions.CompetitionService/ListCompetitions', (b: { pageSize?: number }) => {
        body = b;
        return true;
      })
      .reply(200, { ...sample<Record<string, unknown>>('kaggle'), nextPageToken: '' });
    const res = await fetchPublicApi(src('https://www.kaggle.com/competitions'), testCtx());
    expect(body?.pageSize).toBe(20);
    expect(res.listings).toHaveLength(2);
    const c = res.listings[0]!;
    expect(c.applyUrl).toBe('https://www.kaggle.com/competitions/google-verifiable-quantum-circuit-compilation');
    expect(c.company).toBe('Google Quantum AI');
    expect(c.deadlineAt?.toISOString()).toBe('2027-01-20T23:59:00.000Z');
    expect(c.descriptionMd).toContain('$150,000');
  });
});
