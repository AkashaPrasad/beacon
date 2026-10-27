import nock from 'nock';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { extractListing } from './extract.js';
import { fetchHostOf, ingestSource } from './ingest.js';
import { FirecrawlHttpBackend } from '../crawl/backend.js';
import { CrawlerClient } from '../crawl/client.js';
import { CreditMeter } from '../crawl/meter.js';
import { SourceError } from '../lib/errors.js';
import { ListingModel, SourceModel, SourceRunModel } from '../models/index.js';
import { testDeps } from '../test/deps.js';
import { MemoryRedis } from '../test/memory-redis.js';
import { useMongo } from '../test/mongo.js';
import { sample } from '../test/samples.js';


useMongo();
beforeAll(() => nock.disableNetConnect());
afterEach(() => {
  nock.cleanAll();
});
afterAll(() => nock.enableNetConnect());

type GhJobs = { jobs: { id: number; title: string; content: string }[]; meta: { total: number } };
const GH = 'https://boards-api.greenhouse.io';

async function greenhouseSource(token = 'razorpaysoftwareprivatelimited', name = 'Razorpay') {
  const doc = await SourceModel.create({
    url: `https://job-boards.greenhouse.io/${token}`,
    name,
    kind: 'greenhouse',
    scope: 'community',
    config: { boardToken: token, feedUrl: null, provider: null },
    refreshInterval: 'daily',
  });
  return String(doc._id);
}

function mockGreenhouse(token: string, body: unknown, headers: Record<string, string> = {}) {
  return nock(GH).get(`/v1/boards/${token}/jobs`).query(true).reply(200, body as nock.Body, headers);
}

describe('ingest', () => {
  it('inserts new listings, records the run, marks the source healthy and enqueues the flow + ghostchecks', async () => {
    const deps = testDeps();
    const sourceId = await greenhouseSource();
    mockGreenhouse('razorpaysoftwareprivatelimited', sample('ats-greenhouse'), { etag: '"v1"' });
    const summary = await ingestSource(deps, sourceId, 'manual');
    expect(summary).toMatchObject({ status: 'ok', found: 2, new: 2, updated: 0, unchanged: 0 });

    const docs = await ListingModel.find().lean();
    expect(docs).toHaveLength(2);
    for (const d of docs) {
      expect(d.seenCount).toBe(1);
      expect(d.firstSeenAt.toISOString()).toBe(deps.clock.now.toISOString());
      expect(d.canonicalKey).toMatch(/^razorpay\|/);
      expect(d.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(d.sourceIds.map(String)).toEqual([sourceId]);
      expect(d.structured).toBe(true);
    }
    const source = await SourceModel.findById(sourceId).lean();
    expect(source).toMatchObject({ health: 'healthy', healthCode: 'ok', listingsFound: 2, etag: '"v1"', errorReason: null });
    const runs = await SourceRunModel.find({ sourceId }).lean();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: 'ok', found: 2, new: 2, updated: 0, reason: 'manual' });
    expect(runs[0]!.finishedAt).toBeInstanceOf(Date);

    expect(deps.enqueue.flowListingIds.sort()).toEqual(summary.newIds.sort());
    expect(deps.enqueue.ghostchecks.sort()).toEqual(summary.newIds.sort());
  });

  it('is idempotent: the same listing twice → one doc, seenCount 2, no re-extract', async () => {
    const deps = testDeps();
    const sourceId = await greenhouseSource();
    mockGreenhouse('razorpaysoftwareprivatelimited', sample('ats-greenhouse'));
    await ingestSource(deps, sourceId);
    deps.clock.now = new Date(deps.clock.now.getTime() + 3_600_000);
    mockGreenhouse('razorpaysoftwareprivatelimited', sample('ats-greenhouse'));
    const second = await ingestSource(deps, sourceId);
    expect(second).toMatchObject({ new: 0, updated: 0, unchanged: 2 });
    const docs = await ListingModel.find().lean();
    expect(docs).toHaveLength(2);
    expect(docs.map((d) => d.seenCount)).toEqual([2, 2]);
    expect(docs[0]!.lastSeenAt.toISOString()).toBe(deps.clock.now.toISOString());
    expect(deps.enqueue.flows).toHaveLength(1);
    expect(await SourceRunModel.countDocuments({ sourceId })).toBe(2);
  });

  it('changed content updates the doc and re-enqueues extract/embed', async () => {
    const deps = testDeps();
    const sourceId = await greenhouseSource();
    const body = sample<GhJobs>('ats-greenhouse');
    mockGreenhouse('razorpaysoftwareprivatelimited', body);
    const first = await ingestSource(deps, sourceId);
    // Extract ran once (extractedHash = contentHash).
    for (const id of first.newIds) await extractListing(deps, id);
    const before = await ListingModel.findOne({ externalId: String(body.jobs[0]!.id) }).lean();
    expect(before?.extractedHash).toBe(before?.contentHash);

    const changed = structuredClone(body);
    changed.jobs[0]!.content += '&lt;p&gt;New: stipend INR 50,000 per month&lt;/p&gt;';
    mockGreenhouse('razorpaysoftwareprivatelimited', changed);
    const second = await ingestSource(deps, sourceId);
    expect(second).toMatchObject({ new: 0, updated: 1, unchanged: 1 });
    const after = await ListingModel.findById(before!._id).lean();
    expect(after!.contentHash).not.toBe(before!.contentHash);
    expect(after!.extractedHash).toBeNull();
    expect(after!.embeddingHash).toBeNull();
    expect(after!.seenCount).toBe(2);
    expect(after!.descriptionMd).toContain('50,000');
    expect(deps.enqueue.flows.at(-1)!.listings).toEqual([{ id: String(before!._id), contentHash: after!.contentHash }]);
    const extracted = await extractListing(deps, String(before!._id));
    expect(extracted.status).toBe('extracted');
    expect((await ListingModel.findById(before!._id).lean())!.stipendMin).toBe(50_000);
  });

  it('dedupes within a run and across sources (one doc, both sources recorded)', async () => {
    const deps = testDeps();
    const body = sample<GhJobs>('ats-greenhouse');
    const dup = { ...body, jobs: [body.jobs[0]!, { ...body.jobs[0]!, id: 999 }] };
    const a = await greenhouseSource('razorpaysoftwareprivatelimited', 'Razorpay');
    mockGreenhouse('razorpaysoftwareprivatelimited', dup);
    const first = await ingestSource(deps, a);
    expect(first.found).toBe(1);
    const b = await greenhouseSource('razorpay-mirror', 'Razorpay');
    mockGreenhouse('razorpay-mirror', { ...body, jobs: [body.jobs[0]!] });
    const second = await ingestSource(deps, b);
    expect(second).toMatchObject({ new: 0, unchanged: 1 });
    const docs = await ListingModel.find().lean();
    expect(docs).toHaveLength(1);
    expect(docs[0]!.sourceIds.map(String).sort()).toEqual([a, b].sort());
    expect(docs[0]!.seenCount).toBe(2);
  });

  it('a posting re-listed without its detail (Workday) is the same doc, matched by external id', async () => {
    const deps = testDeps();
    const wd = sample<{ jobPostings: { externalPath: string; locationsText?: string }[]; _detailSample: unknown }>('ats-workday');
    const doc = await SourceModel.create({
      url: 'https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite',
      name: 'Nvidia',
      kind: 'workday',
      scope: 'community',
      config: { boardToken: 'nvidia', feedUrl: null, provider: null, tenant: 'nvidia', wdHost: 'wd5', site: 'NVIDIAExternalCareerSite' },
    });
    const sourceId = String(doc._id);
    const host = nock('https://nvidia.wd5.myworkdayjobs.com');
    const item = { ...wd.jobPostings[0]!, locationsText: '2 Locations' };
    host.post('/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs').reply(200, { total: 1, jobPostings: [item] });
    host.get(`/wday/cxs/nvidia/NVIDIAExternalCareerSite${item.externalPath}`).reply(200, wd._detailSample);
    expect(await ingestSource(deps, sourceId)).toMatchObject({ new: 1 });
    const first = (await ListingModel.findOne().lean())!;
    expect(first.location.length).toBeGreaterThan(0);

    // Second run: the id is known, so no detail call; the list item alone has no location.
    host.post('/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs').reply(200, { total: 1, jobPostings: [item] });
    const second = await ingestSource(deps, sourceId);
    expect(second).toMatchObject({ new: 0, updated: 0, unchanged: 1 });
    const docs = await ListingModel.find().lean();
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ seenCount: 2, location: first.location, contentHash: first.contentHash });
  });

  it('304 Not Modified bumps every live listing of the source', async () => {
    const deps = testDeps();
    const sourceId = await greenhouseSource();
    mockGreenhouse('razorpaysoftwareprivatelimited', sample('ats-greenhouse'), { etag: '"v1"' });
    await ingestSource(deps, sourceId);
    nock(GH, { reqheaders: { 'if-none-match': '"v1"' } }).get('/v1/boards/razorpaysoftwareprivatelimited/jobs').query(true).reply(304);
    const res = await ingestSource(deps, sourceId);
    expect(res.status).toBe('not_modified');
    expect((await ListingModel.find().lean()).map((d) => d.seenCount)).toEqual([2, 2]);
    expect((await SourceModel.findById(sourceId).lean())!.healthCode).toBe('not_modified');
  });

  it('a bad token (404) marks the source failing without throwing', async () => {
    const deps = testDeps();
    const sourceId = await greenhouseSource('nope');
    nock(GH).get('/v1/boards/nope/jobs').query(true).reply(404, { error: 'not found' });
    const res = await ingestSource(deps, sourceId);
    expect(res.status).toBe('error');
    const source = await SourceModel.findById(sourceId).lean();
    expect(source).toMatchObject({ health: 'failing', healthCode: 'notfound' });
    expect(source!.errorReason).toMatch(/^notfound: Greenhouse board "nope" not found/);
    expect((await SourceRunModel.findOne({ sourceId }).lean())!.status).toBe('error');
  });

  it('network errors are rethrown for BullMQ retry and degrade the source', async () => {
    const deps = testDeps();
    const sourceId = await greenhouseSource();
    nock(GH).get('/v1/boards/razorpaysoftwareprivatelimited/jobs').query(true).reply(503);
    await expect(ingestSource(deps, sourceId)).rejects.toBeInstanceOf(SourceError);
    expect((await SourceModel.findById(sourceId).lean())!).toMatchObject({ health: 'degraded', healthCode: 'network', consecutiveFailures: 1 });
  });

  it('firecrawl sources are deferred as paused:credits when the cap is hit and no standby exists', async () => {
    const redis = new MemoryRedis();
    const meter = new CreditMeter(redis, { dailyCap: 0, userDailyCap: 30 });
    const crawler = new CrawlerClient({ cloud: new FirecrawlHttpBackend('cloud', 'https://api.firecrawl.dev', 'k'), selfhosted: null, standby: null, meter, redis });
    nock('https://api.firecrawl.dev').get('/v2/team/credit-usage').reply(200, { success: true, data: { remainingCredits: 300 } });
    const deps = testDeps({ crawler });
    const doc = await SourceModel.create({ url: 'https://careers.acme.test/', name: 'Acme Careers', kind: 'firecrawl', scope: 'community' });
    const res = await ingestSource(deps, String(doc._id));
    expect(res.status).toBe('deferred');
    const source = await SourceModel.findById(doc._id).lean();
    expect(source).toMatchObject({ health: 'degraded', healthCode: 'paused:credits' });
    expect(source!.errorReason).toMatch(/^paused:credits: /);
    expect((await SourceRunModel.findOne({ sourceId: doc._id }).lean())!.status).toBe('deferred');
    expect(await meter.backend()).toBe('selfhosted');
  });

  it('disabled sources are skipped', async () => {
    const doc = await SourceModel.create({ url: 'https://jobs.lever.co/x', name: 'X', kind: 'lever', enabled: false });
    expect((await ingestSource(testDeps(), String(doc._id))).status).toBe('skipped');
  });

  it('per-domain lock host is the API host for ATS kinds', () => {
    expect(fetchHostOf({ kind: 'greenhouse', url: 'https://job-boards.greenhouse.io/x', config: {} })).toBe('boards-api.greenhouse.io');
    expect(fetchHostOf({ kind: 'publicapi', url: 'https://devpost.com/hackathons', config: {} })).toBe('devpost.com');
    expect(fetchHostOf({ kind: 'firecrawl', url: 'https://careers.acme.test/jobs', config: {} })).toBe('careers.acme.test');
  });
});
