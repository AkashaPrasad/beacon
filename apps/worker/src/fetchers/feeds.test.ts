import nock from 'nock';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { detectSourceKind } from './detect.js';
import { fetchFirecrawl, linksFromMarkdown } from './firecrawl.js';
import { fetchRss } from './rss.js';
import { FirecrawlHttpBackend } from '../crawl/backend.js';
import { CrawlerClient } from '../crawl/client.js';
import { CreditMeter } from '../crawl/meter.js';
import { SourceError } from '../lib/errors.js';
import { MemoryRedis } from '../test/memory-redis.js';
import { testCtx, testSource } from '../test/samples.js';


beforeAll(() => nock.disableNetConnect());
afterEach(() => {
  nock.cleanAll();
});
afterAll(() => nock.enableNetConnect());

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>We Work Remotely</title>
<item><title>Acme Labs: Junior Frontend Developer</title><link>https://weworkremotely.com/remote-jobs/acme-junior-frontend</link>
<guid>wwr-1</guid><pubDate>Mon, 26 Oct 2026 10:00:00 +0000</pubDate>
<description><![CDATA[<p>React and TypeScript. Apply by 30 November 2026.</p>]]></description></item>
<item><title>Beta Inc: Data Intern</title><link>https://weworkremotely.com/remote-jobs/beta-data-intern</link><guid>wwr-2</guid>
<description>Python, SQL</description></item>
</channel></rss>`;

describe('rss', () => {
  it('parses items, splits "Company: Role" on job feeds, marks unstructured', async () => {
    nock('https://weworkremotely.com').get('/remote-jobs.rss').reply(200, RSS, { 'content-type': 'application/rss+xml', etag: '"r1"' });
    const res = await fetchRss(testSource({ kind: 'rss', url: 'https://weworkremotely.com/remote-jobs.rss', name: 'We Work Remotely' }), testCtx());
    expect(res.etag).toBe('"r1"');
    expect(res.listings).toHaveLength(2);
    expect(res.listings[0]).toMatchObject({ title: 'Junior Frontend Developer', company: 'Acme Labs', externalId: 'wwr-1', structured: false });
    expect(res.listings[0]!.descriptionMd).toContain('React');
    expect(res.listings[1]!.type).toBe('internship');
  });

  it('rejects non-feeds with a parse error', async () => {
    nock('https://example.test').get('/feed').reply(200, '<html><body>nope</body></html>');
    const err = await fetchRss(testSource({ kind: 'rss', url: 'https://example.test/feed' }), testCtx()).catch((e: unknown) => e);
    expect((err as SourceError).kind).toBe('parse');
  });
});

describe('firecrawl fallback', () => {
  const CLOUD = 'https://api.firecrawl.dev';
  const now = new Date('2026-10-27T06:30:00Z');
  function client(cap = 150) {
    const redis = new MemoryRedis(() => now.getTime());
    nock(CLOUD).get('/v2/team/credit-usage').reply(200, { success: true, data: { remainingCredits: 450 } });
    return new CrawlerClient({
      cloud: new FirecrawlHttpBackend('cloud', CLOUD, 'k'),
      selfhosted: null,
      standby: null,
      meter: new CreditMeter(redis, { dailyCap: cap, userDailyCap: 30 }, () => now),
      redis,
    });
  }
  const source = testSource({ kind: 'firecrawl', url: 'https://careers.acme.test/jobs', name: 'Acme Careers' });

  it('extracts the index with a JSON schema, then scrapes only new detail links (markdown)', async () => {
    nock(CLOUD)
      .post('/v2/scrape', (b: { url: string; formats: { type?: string }[] }) => b.url === source.url && b.formats.some((f) => f.type === 'json'))
      .reply(200, {
        success: true,
        data: {
          markdown: '# Jobs',
          json: {
            listings: [
              { title: 'SDE Intern 2026', url: '/jobs/sde-intern', location: 'Bengaluru', deadline: 'Apply by 30 Nov 2026' },
              { title: 'Backend Engineer', url: 'https://careers.acme.test/jobs/backend', location: 'Remote' },
              { title: 'Known Role', url: 'https://careers.acme.test/jobs/known' },
            ],
          },
          metadata: { statusCode: 200, creditsUsed: 5 },
        },
      });
    const details = nock(CLOUD)
      .post('/v2/scrape', (b: { url: string; formats: unknown[] }) => b.url.includes('/jobs/') && JSON.stringify(b.formats) === '["markdown"]')
      .times(2)
      .reply(200, { success: true, data: { markdown: '## About the role\nReact, Node.js', metadata: { statusCode: 200, creditsUsed: 1 } } });
    const known = new Map([['https://careers.acme.test/jobs/known', { version: null, descriptionMd: 'cached' }]]);
    const res = await fetchFirecrawl(source, testCtx({ crawler: client(), known }));
    expect(details.isDone()).toBe(true);
    expect(res.backend).toBe('cloud');
    expect(res.creditsUsed).toBe(7);
    expect(res.listings).toHaveLength(3);
    const intern = res.listings[0]!;
    expect(intern).toMatchObject({ title: 'SDE Intern 2026', company: 'Acme', type: 'internship', structured: false });
    expect(intern.applyUrl).toBe('https://careers.acme.test/jobs/sde-intern');
    expect(intern.deadlineAt?.toISOString()).toBe('2026-11-30T18:29:59.999Z');
    expect(intern.descriptionMd).toContain('About the role');
    expect(res.listings[2]!.descriptionMd).toBe('cached');
  });

  it('defers with a credits error when the cap is hit and no standby exists', async () => {
    const err = await fetchFirecrawl(source, testCtx({ crawler: client(3) })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SourceError);
    expect((err as SourceError).kind).toBe('credits');
  });

  it('falls back to job-like links when no JSON/LLM is available', () => {
    const md = '[Home](/)\n[Software Engineer Intern](/careers/swe-intern)\n[Read more](/blog/x)\n[Product Designer – apply](https://acme.test/jobs/design)';
    expect(linksFromMarkdown(md, 'https://acme.test/careers').map((l) => l.url)).toEqual([
      'https://acme.test/careers/swe-intern',
      'https://acme.test/jobs/design',
    ]);
  });
});

describe('detectSourceKind', () => {
  it.each([
    ['https://job-boards.greenhouse.io/razorpaysoftwareprivatelimited', 'greenhouse', 'razorpaysoftwareprivatelimited'],
    ['boards.greenhouse.io/embed/job_board?for=stripe', 'greenhouse', 'stripe'],
    ['https://jobs.lever.co/cred/abc', 'lever', 'cred'],
    ['https://jobs.ashbyhq.com/mistral.ai', 'ashby', 'mistral.ai'],
    ['https://careers.smartrecruiters.com/swiggy', 'smartrecruiters', 'swiggy'],
    ['https://apply.workable.com/huggingface/', 'workable', 'huggingface'],
    ['https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite', 'workday', 'nvidia'],
    ['https://devpost.com/hackathons', 'publicapi', null],
    ['https://weworkremotely.com/remote-jobs.rss', 'rss', null],
    ['https://www.flipkartcareers.com/', 'firecrawl', null],
  ])('%s → %s', (url, kind, token) => {
    const d = detectSourceKind(url);
    expect(d.kind).toBe(kind);
    expect(d.boardToken).toBe(token);
  });

  it('derives the Workday CXS feed', () => {
    expect(detectSourceKind('https://sec.wd3.myworkdayjobs.com/Samsung_Careers').feedUrl).toBe(
      'https://sec.wd3.myworkdayjobs.com/wday/cxs/sec/Samsung_Careers/jobs',
    );
  });
});
