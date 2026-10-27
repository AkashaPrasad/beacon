import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { contentHash } from '@kestrel/shared';
import nock from 'nock';
import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { extractByRules, extractGradYears, extractMinExperience, extractStipend } from '../lib/extract-rules.js';
import { type LlmExtraction, ListingLlm, repairJsonText } from '../lib/llm.js';
import { nullLogger } from '../logger.js';
import { ListingModel } from '../models/index.js';
import { testDeps } from '../test/deps.js';
import { MemoryRedis } from '../test/memory-redis.js';
import { useMongo } from '../test/mongo.js';
import { TEST_NOW } from '../test/samples.js';

import { extractListing } from './extract.js';

useMongo();
beforeAll(() => nock.disableNetConnect());
afterEach(() => {
  nock.cleanAll();
});
afterAll(() => nock.enableNetConnect());

const DESCRIPTION = `## Software Engineering Intern (2026 / 2027 batch)

We build payments infrastructure in Go and React.

### Requirements
- B.Tech / B.E. in CS or related, graduating in 2027
- Strong in Python, SQL and data structures
- 0-1 years of experience

### Nice to have
- Kubernetes, Terraform

Stipend: INR 40,000 per month. Applications close on 30 November 2026.
Candidates must be authorized to work in India.`;

describe('deterministic rules', () => {
  it('extracts skills (required vs nice), eligibility, deadline, stipend', () => {
    const r = extractByRules({ title: 'Software Engineering Intern', descriptionMd: DESCRIPTION, country: 'IN', now: TEST_NOW });
    expect(r.skillsRequired).toEqual(expect.arrayContaining(['Go', 'React', 'Python', 'SQL']));
    expect(r.skillsNice).toEqual(expect.arrayContaining(['Kubernetes', 'Terraform']));
    expect(r.skillsRequired).not.toContain('Kubernetes');
    expect(r.eligibility.gradYears).toEqual([2026, 2027]);
    expect(r.eligibility.degrees).toContain('B.Tech / B.E.');
    expect(r.eligibility.minExperienceYears).toBe(0);
    expect(r.eligibility.other.some((o) => /authorized to work in India/.test(o))).toBe(true);
    expect(r.deadline).toEqual({ at: new Date('2026-11-30T18:29:59.999Z'), kind: 'date' });
    expect(r.stipend).toEqual({ min: 40_000, max: 40_000, currency: 'INR', period: 'month' });
  });

  it.each([
    ['Open to 2025 & 2026 passouts', [2025, 2026]],
    ['Class of 2027 students only', [2027]],
    ['2026 batch graduates', [2026]],
    ['Founded in 2021, we have 200 people', []],
  ])('grad years: %s', (text, years) => {
    expect(extractGradYears(text)).toEqual(years);
  });

  it('experience bands and false stipends', () => {
    expect(extractMinExperience('3+ years of backend experience')).toBe(3);
    expect(extractMinExperience('2-4 yrs experience in Java')).toBe(2);
    expect(extractMinExperience('We are 10 years old')).toBeNull();
    expect(extractStipend('Razorpay processes $180+ billion in annualized transactions', 'IN')).toBeNull();
    expect(extractStipend('Compensation: $120,000 - $150,000 per year', 'US')).toMatchObject({ min: 120_000, max: 150_000, currency: 'USD', period: 'year' });
  });
});

async function seedListing(partial: Record<string, unknown>) {
  const descriptionMd = (partial.descriptionMd as string | undefined) ?? DESCRIPTION;
  const doc = await ListingModel.create({
    type: 'fulltime',
    title: 'Software Engineering Intern',
    company: 'Acme',
    applyUrl: 'https://acme.test/jobs/1',
    sourceId: new Types.ObjectId(),
    canonicalKey: `acme|sei|${Math.random()}`,
    contentHash: contentHash(descriptionMd),
    firstSeenAt: TEST_NOW,
    lastSeenAt: TEST_NOW,
    descriptionMd,
    country: 'IN',
    ...partial,
  });
  return String(doc._id);
}

describe('extract pipeline', () => {
  it('structured (ATS) listings use rules only, keep source fields, and are cached by contentHash', async () => {
    const llmCalls: unknown[] = [];
    const deps = testDeps({ llm: { extractListing: (i: unknown) => (llmCalls.push(i), Promise.reject(new Error('no'))) } });
    const id = await seedListing({ structured: true, skillsRequired: ['Rust'], deadlineAt: new Date('2026-12-01T00:00:00Z'), deadlineKind: 'date' });
    expect(await extractListing(deps, id)).toMatchObject({ status: 'extracted', method: 'rules' });
    const l = (await ListingModel.findById(id).lean())!;
    expect(l.skillsRequired[0]).toBe('Rust');
    expect(l.skillsRequired).toContain('Python');
    expect(l.deadlineAt?.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(l.stipendMin).toBe(40_000);
    expect(l.eligibility.gradYears).toEqual([2026, 2027]);
    expect(l.extractedHash).toBe(l.contentHash);
    expect(llmCalls).toHaveLength(0);
    expect(await extractListing(deps, id)).toMatchObject({ status: 'cached' });
  });

  it('unstructured listings go through the LLM and merge with the rules', async () => {
    const result: LlmExtraction = {
      skillsRequired: ['js', 'Next.js'],
      skillsNice: ['GraphQL'],
      eligibility: { gradYears: [2027], degrees: ['B.Tech'], minExperienceYears: null, citizenship: ['India'], other: [] },
      deadline: '15 Dec 2026',
      stipend: { min: 30_000, max: 30_000, currency: 'inr', period: 'month' },
      remote: 'hybrid',
      type: 'internship',
    };
    const deps = testDeps({ llm: { extractListing: () => Promise.resolve(result) } });
    const id = await seedListing({ structured: false, descriptionMd: 'We are hiring a web intern. Apply soon. React work, Bengaluru office two days a week.' });
    expect(await extractListing(deps, id)).toMatchObject({ method: 'llm' });
    const l = (await ListingModel.findById(id).lean())!;
    expect(l.skillsRequired).toEqual(expect.arrayContaining(['JavaScript', 'Next.js', 'React']));
    expect(l.skillsNice).toEqual(['GraphQL']);
    expect(l.eligibility).toMatchObject({ gradYears: [2027], citizenship: ['IN'] });
    expect(l.deadlineAt?.toISOString()).toBe('2026-12-15T18:29:59.999Z');
    expect(l).toMatchObject({ stipendMin: 30_000, currency: 'INR', period: 'month', remote: 'hybrid', type: 'internship', extractMethod: 'llm' });
  });

  it('an LLM failure falls back to rules', async () => {
    const deps = testDeps({ llm: { extractListing: () => Promise.reject(new Error('timeout')) } });
    const id = await seedListing({ structured: false });
    expect(await extractListing(deps, id)).toMatchObject({ status: 'extracted', method: 'rules' });
  });
});

describe('ListingLlm (generateObject over an OpenAI-compatible API)', () => {
  const BASE = 'https://llm.test/v1';
  const llm = (redis = new MemoryRedis()) =>
    new ListingLlm({
      model: createOpenAICompatible({ name: 'server', baseURL: BASE, apiKey: 'k' }).chatModel('muse-spark-1.3-contributor'),
      modelId: 'muse-spark-1.3-contributor',
      logger: nullLogger,
      redis,
      retries: 1,
    });

  it('sends json_object + max_tokens ≥ 4096, strips code fences, validates, caches by contentHash', async () => {
    let request: { response_format?: unknown; max_tokens?: number } | undefined;
    const content = '```json\n{"skillsRequired":["Python"],"skillsNice":[],"eligibility":{"gradYears":[2026]},"deadline":null,"stipend":null,"remote":"remote","type":"internship"}\n```';
    const scope = nock(BASE)
      .post('/chat/completions', (b: { response_format?: unknown; max_tokens?: number }) => {
        request = b;
        return true;
      })
      .reply(200, {
        id: 'x',
        object: 'chat.completion',
        created: 1,
        model: 'm',
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 120, completion_tokens: 900, total_tokens: 1020 },
      });
    const redis = new MemoryRedis();
    const client = llm(redis);
    const out = await client.extractListing({ title: 'Intern', company: 'Acme', descriptionMd: 'Python intern, remote.', contentHash: 'h1' });
    expect(scope.isDone()).toBe(true);
    expect(request?.response_format).toEqual({ type: 'json_object' });
    expect(request?.max_tokens).toBeGreaterThanOrEqual(4096);
    expect(out).toMatchObject({ skillsRequired: ['Python'], remote: 'remote', type: 'internship', eligibility: { gradYears: [2026], degrees: [] } });
    // Second call is served from the cache (no HTTP mock left).
    expect(await client.extractListing({ title: 'Intern', company: 'Acme', descriptionMd: 'x', contentHash: 'h1' })).toEqual(out);
  });

  it('retries then fails on a broken provider', async () => {
    nock(BASE).post('/chat/completions').times(2).reply(500, { error: { message: 'down' } });
    await expect(llm().extractListing({ title: 'a', company: 'b', descriptionMd: 'c', contentHash: 'h2' })).rejects.toThrow();
  });

  it('repairJsonText', () => {
    expect(repairJsonText('Sure! ```json\n{"a":1}\n``` done')).toBe('{"a":1}');
    expect(repairJsonText('noise {"a":{"b":2}} trailing')).toBe('{"a":{"b":2}}');
  });
});
