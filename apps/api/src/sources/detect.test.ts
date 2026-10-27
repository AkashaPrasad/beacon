import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import nock from 'nock';
import { describe, expect, it } from 'vitest';

import {
  atsApiUrl,
  companyDomainOf,
  detectSource,
  findAtsInHtml,
  findFeedLink,
  matchAtsUrl,
  matchPublicApi,
  parseFeed,
  WORKDAY_BODY,
} from './detect.js';

const samples = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../seed/samples');
const sample = (name: string): unknown => JSON.parse(readFileSync(resolve(samples, name), 'utf8'));
const deps = { resolveDns: false, timeoutMs: 2_000 };

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>Acme Jobs</title>
<item><title>Backend Intern</title></item><item><title><![CDATA[Data Intern & Analyst]]></title></item></channel></rss>`;

describe('matchAtsUrl', () => {
  it.each([
    ['https://boards.greenhouse.io/stripe', 'greenhouse', 'stripe'],
    ['https://job-boards.greenhouse.io/razorpaysoftwareprivatelimited/jobs/123', 'greenhouse', 'razorpaysoftwareprivatelimited'],
    ['https://boards.greenhouse.io/embed/job_board?for=figma', 'greenhouse', 'figma'],
    ['https://boards-api.greenhouse.io/v1/boards/airbnb/jobs', 'greenhouse', 'airbnb'],
    ['https://jobs.lever.co/cred', 'lever', 'cred'],
    ['https://api.lever.co/v0/postings/paytm?mode=json', 'lever', 'paytm'],
    ['https://jobs.ashbyhq.com/mistral.ai', 'ashby', 'mistral.ai'],
    ['https://api.ashbyhq.com/posting-api/job-board/atlan', 'ashby', 'atlan'],
    ['https://careers.smartrecruiters.com/Swiggy', 'smartrecruiters', 'Swiggy'],
    ['https://api.smartrecruiters.com/v1/companies/canva/postings', 'smartrecruiters', 'canva'],
    ['https://apply.workable.com/huggingface/', 'workable', 'huggingface'],
    ['https://www.workable.com/api/accounts/huggingface?details=true', 'workable', 'huggingface'],
    ['https://acme.workable.com', 'workable', 'acme'],
  ])('%s → %s', (url, kind, token) => {
    expect(matchAtsUrl(url)).toMatchObject({ kind, token });
  });

  it('parses Workday tenant, host and site (with or without locale)', () => {
    expect(matchAtsUrl('https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite')).toEqual({
      kind: 'workday',
      token: 'nvidia',
      wdHost: 'wd5',
      site: 'NVIDIAExternalCareerSite',
    });
    expect(matchAtsUrl('https://sec.wd3.myworkdayjobs.com/en-US/Samsung_Careers/job/x')).toMatchObject({ site: 'Samsung_Careers' });
    expect(matchAtsUrl('https://x.wd1.myworkdayjobs.com/wday/cxs/x/External/jobs')).toMatchObject({ site: 'External' });
    expect(matchAtsUrl('https://x.wd1.myworkdayjobs.com/')).toBeNull();
  });

  it('ignores non-ATS and reserved paths', () => {
    expect(matchAtsUrl('https://stripe.com/jobs')).toBeNull();
    expect(matchAtsUrl('https://boards.greenhouse.io/')).toBeNull();
    expect(matchAtsUrl('https://apply.workable.com/')).toBeNull();
    expect(matchAtsUrl('not a url')).toBeNull();
  });

  it('builds the JSON endpoints from seed/VERIFICATION.md', () => {
    expect(atsApiUrl({ kind: 'lever', token: 'x', eu: true }).apiUrl).toBe('https://api.eu.lever.co/v0/postings/x?mode=json');
    expect(atsApiUrl({ kind: 'workday', token: 'nvidia', wdHost: 'wd5', site: 'Ext' })).toEqual({
      apiUrl: 'https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/Ext/jobs',
      method: 'POST',
      body: WORKDAY_BODY,
    });
  });
});

describe('HTML sniffing helpers', () => {
  it('finds ATS embeds and links in careers pages', () => {
    expect(findAtsInHtml('<script src="https://boards.greenhouse.io/embed/job_board/js?for=acme"></script>')).toEqual({
      kind: 'greenhouse',
      token: 'acme',
    });
    expect(findAtsInHtml('<a href="https://jobs.lever.co/acme/123">a</a><a href="https://jobs.lever.co/acme">b</a>')).toMatchObject({
      kind: 'lever',
      token: 'acme',
    });
    expect(findAtsInHtml('<iframe src="https://jobs.ashbyhq.com/acme?embed=js">')).toMatchObject({ kind: 'ashby' });
    expect(findAtsInHtml('href="https://acme.wd3.myworkdayjobs.com/en-US/Careers"')).toMatchObject({ kind: 'workday', site: 'Careers' });
    expect(findAtsInHtml('<p>no jobs here</p>')).toBeNull();
  });

  it('finds RSS/Atom alternate links and parses feeds', () => {
    expect(findFeedLink('<link type="application/rss+xml" rel="alternate" href="/feed.xml">', 'https://a.com/careers')).toBe(
      'https://a.com/feed.xml',
    );
    expect(findFeedLink('<link rel="alternate" type="application/atom+xml" href="https://b.com/atom">', 'https://a.com')).toBe(
      'https://b.com/atom',
    );
    expect(findFeedLink('<link rel="stylesheet" href="x.css">', 'https://a.com')).toBeNull();
    expect(parseFeed(RSS)).toEqual({ title: 'Acme Jobs', count: 2, titles: ['Backend Intern', 'Data Intern & Analyst'] });
  });

  it('derives company domains and public API providers', () => {
    expect(companyDomainOf(new URL('https://careers.stripe.com/x'))).toBe('stripe.com');
    expect(companyDomainOf(new URL('https://jobs.lever.co/x'))).toBeNull();
    expect(matchPublicApi(new URL('https://devpost.com/hackathons'))?.provider).toBe('devpost');
    expect(matchPublicApi(new URL('https://devpost.com/software'))).toBeNull();
  });
});

describe('detectSource (nock fixtures)', () => {
  it('Greenhouse: counts postings from the boards API', async () => {
    nock('https://boards-api.greenhouse.io').get('/v1/boards/razorpaysoftwareprivatelimited/jobs').reply(200, sample('ats-greenhouse.json'));
    const r = await detectSource('job-boards.greenhouse.io/razorpaysoftwareprivatelimited', deps);
    expect(r).toMatchObject({
      kind: 'greenhouse',
      boardToken: 'razorpaysoftwareprivatelimited',
      previewCount: 27,
      company: 'Razorpay Software Private Limited',
      valid: true,
      confidence: 1,
      costsCredits: false,
      apiUrl: 'https://boards-api.greenhouse.io/v1/boards/razorpaysoftwareprivatelimited/jobs',
    });
    expect(r.sampleTitles[0]).toBe('AI Builder');
    expect(r.message).toMatch(/Greenhouse board `razorpaysoftwareprivatelimited` → 27 jobs/);
  });

  it('Greenhouse: a wrong board token is a 404 → valid:false', async () => {
    nock('https://boards-api.greenhouse.io').get('/v1/boards/nope/jobs').reply(404, { status: 404, error: 'Job not found' });
    const r = await detectSource('https://boards.greenhouse.io/nope', deps);
    expect(r).toMatchObject({ kind: 'greenhouse', valid: false, previewCount: 0 });
    expect(r.message).toMatch(/not found/);
  });

  it('Lever, Ashby and Workable', async () => {
    nock('https://api.lever.co').get('/v0/postings/cred').query({ mode: 'json' }).reply(200, sample('ats-lever.json'));
    nock('https://api.ashbyhq.com').get('/posting-api/job-board/atlan').reply(200, sample('ats-ashby.json'));
    nock('https://www.workable.com').get('/api/accounts/huggingface').query({ details: 'true' }).reply(200, sample('ats-workable.json'));
    const lever = await detectSource('https://jobs.lever.co/cred', deps);
    expect(lever).toMatchObject({ kind: 'lever', previewCount: 2, company: 'Cred' });
    expect(lever.sampleTitles[0]).toBe('accounts payable manager');
    const ashby = await detectSource('https://jobs.ashbyhq.com/atlan', deps);
    expect(ashby).toMatchObject({ kind: 'ashby', previewCount: 2 });
    const workable = await detectSource('https://apply.workable.com/huggingface', deps);
    expect(workable).toMatchObject({ kind: 'workable', previewCount: 2, company: 'Hugging Face' });
  });

  it('SmartRecruiters: uses totalFound; 0 means unknown company', async () => {
    nock('https://api.smartrecruiters.com').get('/v1/companies/swiggy/postings').query({ limit: '100' }).reply(200, sample('ats-smartrecruiters.json'));
    nock('https://api.smartrecruiters.com')
      .get('/v1/companies/notacompany/postings')
      .query(true)
      .reply(200, { offset: 0, limit: 100, totalFound: 0, content: [] });
    const swiggy = await detectSource('careers.smartrecruiters.com/swiggy', deps);
    expect(swiggy).toMatchObject({ kind: 'smartrecruiters', previewCount: 201, company: 'SWIGGY', valid: true });
    const unknown = await detectSource('careers.smartrecruiters.com/notacompany', deps);
    expect(unknown).toMatchObject({ valid: false, previewCount: 0 });
    expect(unknown.message).toMatch(/no public postings/);
  });

  it('Workday: POSTs the paged body and reads total', async () => {
    let body: unknown;
    nock('https://nvidia.wd5.myworkdayjobs.com')
      .post('/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs', (b: unknown) => {
        body = b;
        return true;
      })
      .reply(200, sample('ats-workday.json'));
    const r = await detectSource('https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite', deps);
    expect(body).toEqual(WORKDAY_BODY);
    expect(r).toMatchObject({ kind: 'workday', previewCount: 1099, boardToken: 'nvidia' });
    expect(r.config).toMatchObject({ tenant: 'nvidia', site: 'NVIDIAExternalCareerSite', wdHost: 'wd5', method: 'POST' });
  });

  it('preview failures keep the detected kind', async () => {
    nock('https://api.lever.co').get('/v0/postings/slow').query(true).replyWithError('socket hang up');
    const r = await detectSource('https://jobs.lever.co/slow', deps);
    expect(r).toMatchObject({ kind: 'lever', previewCount: null, valid: true, confidence: 0.6 });
  });

  it('careers page HTML with a Greenhouse embed → greenhouse (confidence 0.8)', async () => {
    nock('https://careers.acme.com')
      .get('/')
      .reply(200, '<html><body><div id="grnhse_app"></div><script src="https://boards.greenhouse.io/embed/job_board/js?for=acme"></script></body></html>', {
        'content-type': 'text/html',
      });
    nock('https://boards-api.greenhouse.io').get('/v1/boards/acme/jobs').reply(200, { jobs: [{ title: 'Intern', company_name: 'Acme Inc' }], meta: { total: 1 } });
    const r = await detectSource('https://careers.acme.com/', deps);
    expect(r).toMatchObject({ kind: 'greenhouse', boardToken: 'acme', confidence: 0.8, companyDomain: 'acme.com', previewCount: 1 });
  });

  it('follows redirects (≤ 3) and records finalUrl', async () => {
    nock('https://acme.com').get('/careers').reply(301, '', { location: 'https://jobs.lever.co/acme' });
    nock('https://api.lever.co').get('/v0/postings/acme').query(true).reply(200, [{ text: 'SWE Intern' }]);
    const r = await detectSource('https://acme.com/careers', deps);
    expect(r).toMatchObject({ kind: 'lever', finalUrl: 'https://jobs.lever.co/acme', previewCount: 1 });

    nock('https://loop.example')
      .get(/.*/)
      .times(5)
      .reply(302, '', { location: 'https://loop.example/again' });
    const loop = await detectSource('https://loop.example/start', deps);
    expect(loop).toMatchObject({ kind: 'firecrawl', valid: false });
    expect(loop.message).toMatch(/redirects/);
  });

  it('RSS feed URLs and <link rel=alternate> feeds', async () => {
    nock('https://blog.example').get('/feed').reply(200, RSS, { 'content-type': 'application/rss+xml' });
    const direct = await detectSource('https://blog.example/feed', deps);
    expect(direct).toMatchObject({ kind: 'rss', previewCount: 2, name: 'Acme Jobs', confidence: 0.95 });

    nock('https://site.example')
      .get('/jobs')
      .reply(200, '<html><head><link rel="alternate" type="application/rss+xml" href="/jobs.rss"></head></html>', { 'content-type': 'text/html' });
    nock('https://site.example').get('/jobs.rss').reply(200, RSS, { 'content-type': 'text/xml' });
    const linked = await detectSource('https://site.example/jobs', deps);
    expect(linked).toMatchObject({ kind: 'rss', apiUrl: 'https://site.example/jobs.rss', confidence: 0.75 });
  });

  it('sitemaps', async () => {
    nock('https://maps.example')
      .get('/sitemap.xml')
      .reply(200, '<?xml version="1.0"?><urlset><url><loc>a</loc></url><url><loc>b</loc></url></urlset>', { 'content-type': 'application/xml' });
    const r = await detectSource('https://maps.example/sitemap.xml', deps);
    expect(r).toMatchObject({ kind: 'sitemap', previewCount: 2, costsCredits: false });
  });

  it('anything else falls back to firecrawl with previewCount null', async () => {
    nock('https://www.zoho.com').get('/careers/').reply(200, '<html><head><title>Careers | Zoho</title></head><body>Jobs</body></html>', {
      'content-type': 'text/html',
    });
    const r = await detectSource('https://www.zoho.com/careers/', deps);
    expect(r).toMatchObject({ kind: 'firecrawl', previewCount: null, costsCredits: true, name: 'Careers', companyDomain: 'zoho.com' });

    nock('https://down.example').get('/').reply(503, 'busy');
    const down = await detectSource('https://down.example/', deps);
    expect(down).toMatchObject({ kind: 'firecrawl' });
    expect(down.message).toMatch(/HTTP 503/);
  });

  it('caps the body at 2 MB', async () => {
    const huge = `<html>${'x'.repeat(3 * 1024 * 1024)}<a href="https://jobs.lever.co/late"></a></html>`;
    nock('https://huge.example').get('/').reply(200, huge, { 'content-type': 'text/html' });
    const r = await detectSource('https://huge.example/', deps);
    expect(r.kind).toBe('firecrawl');
  });

  it('public APIs are recognised without a fetch', async () => {
    const r = await detectSource('https://devpost.com/hackathons', deps);
    expect(r).toMatchObject({ kind: 'publicapi', config: { provider: 'devpost' }, costsCredits: false });
  });

  it('refuses private addresses and bad URLs', async () => {
    await expect(detectSource('http://127.0.0.1:6379/', deps)).rejects.toMatchObject({ status: 400 });
    await expect(detectSource('http://localhost/', deps)).rejects.toMatchObject({ status: 400 });
    await expect(detectSource('http://10.1.2.3/', deps)).rejects.toMatchObject({ status: 400 });
    await expect(detectSource('ftp://example.com/', deps)).rejects.toMatchObject({ status: 400 });
    await expect(detectSource('http://exa mple.com', deps)).rejects.toMatchObject({ status: 400 });
  });
});
