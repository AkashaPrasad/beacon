import { listingDraftSchema } from '@kestrel/shared';
import nock from 'nock';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { SourceError } from '../lib/errors.js';
import { sample, testCtx, testSource } from '../test/samples.js';

import { fetchAshby } from './ashby.js';
import { fetchGreenhouse } from './greenhouse.js';
import { fetchLever } from './lever.js';
import { fetchSmartRecruiters } from './smartrecruiters.js';
import type { NormalisedListing } from './types.js';
import { fetchWorkable } from './workable.js';
import { fetchWorkday } from './workday.js';

beforeAll(() => nock.disableNetConnect());
afterEach(() => {
  nock.cleanAll();
});
afterAll(() => nock.enableNetConnect());

/** Every listing must satisfy the shared draft schema once ingest adds the derived fields. */
function expectValid(listings: NormalisedListing[]) {
  for (const l of listings) {
    const { externalId: _e, structured: _s, version: _v, ...rest } = l;
    const parsed = listingDraftSchema.safeParse({ ...rest, sourceId: 'src1' });
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  }
}

describe('greenhouse', () => {
  const source = testSource({ kind: 'greenhouse', url: 'https://job-boards.greenhouse.io/razorpaysoftwareprivatelimited', name: 'Razorpay' });

  it('maps jobs with decoded descriptions, offices/metadata locations and dates', async () => {
    nock('https://boards-api.greenhouse.io')
      .get('/v1/boards/razorpaysoftwareprivatelimited/jobs')
      .query({ content: 'true' })
      .reply(200, sample('ats-greenhouse'), { etag: 'W/"gh1"' });
    const res = await fetchGreenhouse(source, testCtx());
    expect(res.listings).toHaveLength(2);
    expect(res.etag).toBe('W/"gh1"');
    expect(res.totalReported).toBe(27);
    const first = res.listings[0]!;
    expect(first.title).toBe('AI Builder');
    expect(first.company).toBe('Razorpay');
    expect(first.externalId).toBe('4744950005');
    expect(first.location).toContain('Bengaluru');
    expect(first.country).toBe('IN');
    expect(first.applyUrl).toContain('job-boards.greenhouse.io/razorpaysoftwareprivatelimited/jobs/4744950005');
    expect(first.descriptionMd).not.toContain('&lt;');
    expect(first.descriptionMd).toContain('Razorpay');
    expect(first.postedAt?.toISOString()).toBe('2026-10-27T06:10:42.000Z');
    expect(first.structured).toBe(true);
    expectValid(res.listings);
  });

  it('sends conditional headers and handles 304', async () => {
    nock('https://boards-api.greenhouse.io', { reqheaders: { 'if-none-match': 'W/"gh1"' } })
      .get('/v1/boards/razorpaysoftwareprivatelimited/jobs')
      .query(true)
      .reply(304);
    const res = await fetchGreenhouse({ ...source, etag: 'W/"gh1"' }, testCtx());
    expect(res.notModified).toBe(true);
    expect(res.listings).toEqual([]);
  });

  it('a bad board token (404) is a notfound SourceError', async () => {
    nock('https://boards-api.greenhouse.io').get('/v1/boards/nope/jobs').query(true).reply(404, { status: 404, error: 'Job board not found' });
    const err = await fetchGreenhouse({ ...source, config: { boardToken: 'nope' } }, testCtx()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SourceError);
    expect((err as SourceError).kind).toBe('notfound');
    expect((err as SourceError).message).toMatch(/board token/);
  });
});

describe('lever', () => {
  const source = testSource({ kind: 'lever', url: 'https://jobs.lever.co/cred', name: 'CRED' });

  it('maps postings (lists → description, commitment, workplaceType)', async () => {
    nock('https://api.lever.co').get('/v0/postings/cred').query({ mode: 'json' }).reply(200, sample('ats-lever'));
    const res = await fetchLever(source, testCtx());
    expect(res.listings).toHaveLength(2);
    const p = res.listings[0]!;
    expect(p.title).toBe('accounts payable manager');
    expect(p.company).toBe('CRED');
    expect(p.remote).toBe('onsite');
    expect(p.location).toEqual(['hyderabad']);
    expect(p.descriptionMd).toContain('Prefr');
    expect(p.applyUrl).toBe('https://jobs.lever.co/cred/aa98a938-af3a-45f5-851d-966b2b5bad33');
    expect(p.type).toBe('fulltime');
    expectValid(res.listings);
  });

  it('detects single-posting "we moved" boards', async () => {
    const moved = [{ ...sample<Record<string, unknown>[]>('ats-lever')[0], text: 'We have moved!', descriptionPlain: 'We moved to a new careers page.', lists: [] }];
    nock('https://api.lever.co').get('/v0/postings/anyscale').query(true).reply(200, moved);
    const err = await fetchLever({ ...source, url: 'https://jobs.lever.co/anyscale' }, testCtx()).catch((e: unknown) => e);
    expect((err as SourceError).kind).toBe('notfound');
    expect((err as SourceError).message).toMatch(/we moved/);
  });
});

describe('ashby', () => {
  it('maps jobUrl, isRemote and employmentType', async () => {
    nock('https://api.ashbyhq.com')
      .get('/posting-api/job-board/atlan')
      .query({ includeCompensation: 'true' })
      .reply(200, sample('ats-ashby'));
    const res = await fetchAshby(testSource({ kind: 'ashby', url: 'https://jobs.ashbyhq.com/atlan', name: 'Atlan' }), testCtx());
    expect(res.listings).toHaveLength(2);
    const j = res.listings[0]!;
    expect(j.title).toBe('AI Native Builder/Architect');
    expect(j.remote).toBe('remote');
    expect(j.country).toBe('IN');
    expect(j.applyUrl).toBe('https://jobs.ashbyhq.com/atlan/c6bb032c-6ac8-4b59-915c-d59b6f3a86f8');
    expect(j.descriptionMd).toMatch(/Who We Are/i);
    expectValid(res.listings);
  });
});

describe('smartrecruiters', () => {
  const source = testSource({ kind: 'smartrecruiters', url: 'https://careers.smartrecruiters.com/swiggy', name: 'Swiggy' });
  const list = sample<{ content: { id: string; releasedDate: string }[]; totalFound: number; _detailSample: unknown }>('ats-smartrecruiters');
  const listBody = { offset: 0, limit: 100, totalFound: list.content.length, content: list.content };

  it('lists postings and fetches details only for new/changed ones', async () => {
    const [a, b] = list.content;
    nock('https://api.smartrecruiters.com').get('/v1/companies/swiggy/postings').query({ limit: '100', offset: '0' }).reply(200, listBody);
    const detail = nock('https://api.smartrecruiters.com').get(`/v1/companies/swiggy/postings/${a!.id}`).reply(200, list._detailSample);
    const known = new Map([[b!.id, { version: b!.releasedDate, descriptionMd: 'cached description' }]]);
    const res = await fetchSmartRecruiters(source, testCtx({ known }));
    expect(detail.isDone()).toBe(true);
    expect(res.listings).toHaveLength(2);
    const first = res.listings.find((l) => l.externalId === a!.id)!;
    expect(first.title).toBe('Data Scientist II');
    expect(first.remote).toBe('hybrid');
    expect(first.applyUrl).toBe('https://jobs.smartrecruiters.com/SWIGGY/6000000001526179-data-scientist-ii');
    expect(first.descriptionMd).toContain('Qualifications');
    expect(first.location[0]).toContain('Bengaluru');
    expect(res.listings.find((l) => l.externalId === b!.id)!.descriptionMd).toBe('cached description');
    expectValid(res.listings);
  });

  it('totalFound=0 (unknown company id) is notfound', async () => {
    nock('https://api.smartrecruiters.com').get('/v1/companies/zzz/postings').query(true).reply(200, { offset: 0, limit: 100, totalFound: 0, content: [] });
    const err = await fetchSmartRecruiters({ ...source, config: { boardToken: 'zzz' } }, testCtx()).catch((e: unknown) => e);
    expect((err as SourceError).kind).toBe('notfound');
  });
});

describe('workable', () => {
  it('maps the widget API with details', async () => {
    nock('https://www.workable.com').get('/api/accounts/huggingface').query({ details: 'true' }).reply(200, sample('ats-workable'));
    const res = await fetchWorkable(testSource({ kind: 'workable', url: 'https://apply.workable.com/huggingface', name: 'Hugging Face' }), testCtx());
    expect(res.listings).toHaveLength(2);
    const j = res.listings[0]!;
    expect(j.title).toMatch(/Open-Source Machine Learning Engineer/);
    expect(j.remote).toBe('remote');
    expect(j.country).toBe('FR');
    expect(j.applyUrl).toBe('https://apply.workable.com/j/81B46579FE');
    expectValid(res.listings);
  });
});

describe('workday', () => {
  const source = testSource({ kind: 'workday', url: 'https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite', name: 'Nvidia' });
  const wd = sample<{ total: number; jobPostings: { externalPath: string }[]; _detailSample: unknown }>('ats-workday');

  it('POSTs the CXS search, pages, and fetches details for new postings', async () => {
    let body: unknown;
    nock('https://nvidia.wd5.myworkdayjobs.com')
      .post('/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs', (b: unknown) => {
        body = b;
        return true;
      })
      .reply(200, { total: 2, jobPostings: wd.jobPostings });
    nock('https://nvidia.wd5.myworkdayjobs.com')
      .get(`/wday/cxs/nvidia/NVIDIAExternalCareerSite${wd.jobPostings[0]!.externalPath}`)
      .reply(200, wd._detailSample);
    nock('https://nvidia.wd5.myworkdayjobs.com')
      .get(`/wday/cxs/nvidia/NVIDIAExternalCareerSite${wd.jobPostings[1]!.externalPath}`)
      .reply(500);
    const res = await fetchWorkday(source, testCtx());
    expect(body).toEqual({ appliedFacets: {}, limit: 20, offset: 0, searchText: '' });
    expect(res.listings).toHaveLength(2);
    const [a, b] = res.listings;
    expect(a!.title).toBe('DFT Intern - 2027');
    expect(a!.type).toBe('internship');
    expect(a!.externalId).toBe('JR2027176');
    expect(a!.country).toBe('CN');
    expect(a!.postedAt?.toISOString().slice(0, 10)).toBe('2026-10-13');
    expect(a!.descriptionMd).toContain('DFT');
    expect(a!.applyUrl).toContain('nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/');
    // Detail failed → "Posted 30+ Days Ago" fallback date, empty description, still listed.
    expect(b!.postedAt?.toISOString().slice(0, 10)).toBe('2026-09-27');
    expect(res.warnings.some((w) => w.includes('detail'))).toBe(true);
    expectValid(res.listings);
  });

  it('stops paging at 200 postings', async () => {
    const page = Array.from({ length: 20 }, (_, i) => ({ title: `Role ${i}`, externalPath: `/job/x/Role_${i}`, locationsText: 'India, Bangalore', postedOn: 'Posted Today', bulletFields: [] as string[] }));
    // (nock reply callbacks hang with native fetch; match each page by its body instead.)
    const scopes = Array.from({ length: 10 }, (_, n) =>
      nock('https://nvidia.wd5.myworkdayjobs.com')
        .post('/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs', (b: { offset: number }) => b.offset === n * 20)
        .reply(200, {
          total: n === 0 ? 2000 : 0,
          jobPostings: page.map((p) => ({ ...p, externalPath: `${p.externalPath}_${n}`, bulletFields: [`R${n}-${p.title}`] })),
        }),
    );
    const res = await fetchWorkday(source, testCtx({ maxDetailCalls: 0 }));
    expect(scopes.every((sc) => sc.isDone())).toBe(true);
    expect(res.listings).toHaveLength(200);
    expect(res.totalReported).toBe(2000);
  });
});
