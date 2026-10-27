import { describe, expect, it } from 'vitest';

import {
  canSubmit,
  candidateUrl,
  detectErrorFrom,
  detectReducer,
  estimateDailyCredits,
  initialDetectState,
  resultSummary,
  shouldDetect,
  type DetectEvent,
  type DetectResult,
  type DetectState,
} from './detect-machine';

function result(patch: Partial<DetectResult> = {}): DetectResult {
  return {
    url: 'https://boards.greenhouse.io/stripe',
    kind: 'greenhouse',
    confidence: 1,
    boardToken: 'stripe',
    company: 'Stripe',
    name: 'Stripe',
    previewCount: 142,
    sampleTitles: ['Software Engineer, Intern'],
    costsCredits: false,
    message: 'Detected',
    valid: true,
    apiUrl: 'https://boards-api.greenhouse.io/v1/boards/stripe/jobs',
    companyName: 'Stripe',
    companyDomain: 'stripe.com',
    finalUrl: null,
    config: { boardToken: 'stripe', feedUrl: null, provider: null },
    ...patch,
  };
}

function run(events: DetectEvent[], from: DetectState = initialDetectState): DetectState {
  return events.reduce(detectReducer, from);
}

describe('candidateUrl', () => {
  it.each([
    ['boards.greenhouse.io/stripe', 'https://boards.greenhouse.io/stripe'],
    ['https://jobs.lever.co/cred/', 'https://jobs.lever.co/cred'],
    ['  www.acme.dev/careers ', 'https://acme.dev/careers'],
  ])('accepts %s', (input, expected) => {
    expect(candidateUrl(input)).toBe(expected);
  });
  it.each(['', 'str', 'stripe', 'http://', 'acme .dev', 'ftp://x.org', 'acme.d', 'a..com'])(
    'rejects %j',
    (input) => {
      expect(candidateUrl(input)).toBeNull();
    },
  );
});

describe('typing', () => {
  it('goes idle → typing with a hint for non-URLs, and back to idle when cleared', () => {
    const typing = run([{ type: 'input', value: 'stripe' }]);
    expect(typing).toMatchObject({
      status: 'typing',
      url: null,
      hint: expect.stringContaining('full link'),
    });
    expect(shouldDetect(typing)).toBe(false);
    expect(run([{ type: 'input', value: '' }], typing)).toEqual(initialDetectState);
  });
  it('a valid URL is ready to detect once the debounce settles', () => {
    const typing = run([
      { type: 'input', value: 'boards.greenhouse.io/stripe' },
      { type: 'settled' },
    ]);
    expect(shouldDetect(typing)).toBe(true);
    expect(canSubmit(typing)).toBe(false);
  });
});

describe('detecting', () => {
  const detecting = run([
    { type: 'input', value: 'boards.greenhouse.io/stripe' },
    { type: 'start', requestId: 1 },
  ]);

  it('enters detecting with the normalised url', () => {
    expect(detecting).toMatchObject({
      status: 'detecting',
      url: 'https://boards.greenhouse.io/stripe',
      requestId: 1,
    });
  });

  it('an ATS hit becomes detected', () => {
    const s = detectReducer(detecting, { type: 'success', requestId: 1, result: result() });
    expect(s.status).toBe('detected');
    expect(canSubmit(s)).toBe(true);
    expect(s.status === 'detected' && s.redirectedTo).toBeNull();
  });

  it('a crawler fallback becomes crawl (still submittable)', () => {
    const s = detectReducer(detecting, {
      type: 'success',
      requestId: 1,
      result: result({
        kind: 'firecrawl',
        costsCredits: true,
        previewCount: null,
        boardToken: null,
      }),
    });
    expect(s.status).toBe('crawl');
    expect(canSubmit(s)).toBe(true);
  });

  it('valid:false (e.g. Greenhouse 404) is a bad-token error', () => {
    const s = detectReducer(detecting, {
      type: 'success',
      requestId: 1,
      result: result({ valid: false, boardToken: 'strpie', previewCount: 0 }),
    });
    expect(s).toMatchObject({ status: 'error', error: { kind: 'bad-token' } });
    expect(s.status === 'error' && s.error.message).toContain('“strpie”');
    expect(canSubmit(s)).toBe(false);
  });

  it('notes a redirect when finalUrl differs from the input', () => {
    const s = detectReducer(detecting, {
      type: 'success',
      requestId: 1,
      result: result({ finalUrl: 'https://job-boards.greenhouse.io/stripe' }),
    });
    expect(s.status === 'detected' && s.redirectedTo).toBe(
      'https://job-boards.greenhouse.io/stripe',
    );
    const same = detectReducer(detecting, {
      type: 'success',
      requestId: 1,
      result: result({ finalUrl: 'https://www.boards.greenhouse.io/stripe/' }),
    });
    expect(same.status === 'detected' && same.redirectedTo).toBeNull();
  });

  it('ignores stale responses from an older request', () => {
    const second = run(
      [
        { type: 'input', value: 'jobs.lever.co/cred' },
        { type: 'start', requestId: 2 },
      ],
      detecting,
    );
    const stale = detectReducer(second, { type: 'success', requestId: 1, result: result() });
    expect(stale).toBe(second);
    const staleFail = detectReducer(second, {
      type: 'failure',
      requestId: 1,
      error: { kind: 'unreachable', message: 'x' },
    });
    expect(staleFail).toBe(second);
  });

  it('typing again during detection cancels it back to typing', () => {
    const s = detectReducer(detecting, { type: 'input', value: 'boards.greenhouse.io/stripe2' });
    expect(s.status).toBe('typing');
    expect(detectReducer(s, { type: 'success', requestId: 1, result: result() })).toBe(s);
  });

  it('a failure becomes an error, and retry re-enters detecting', () => {
    const failed = detectReducer(detecting, {
      type: 'failure',
      requestId: 1,
      error: { kind: 'unreachable', message: 'nope' },
    });
    expect(failed.status).toBe('error');
    expect(detectReducer(failed, { type: 'retry', requestId: 3 })).toMatchObject({
      status: 'detecting',
      requestId: 3,
    });
  });
});

describe('detectErrorFrom', () => {
  it('maps API statuses to friendly kinds', () => {
    expect(
      detectErrorFrom(429, { error: { code: 'RATE_LIMITED', details: { retryAfterSeconds: 12 } } }),
    ).toMatchObject({
      kind: 'rate-limited',
      retryAfterSeconds: 12,
    });
    expect(detectErrorFrom(502, null).kind).toBe('unreachable');
    expect(detectErrorFrom(0, null).kind).toBe('unreachable');
    expect(detectErrorFrom(409, { error: { details: { existingId: 'abc' } } })).toMatchObject({
      kind: 'duplicate',
      existingId: 'abc',
    });
    expect(detectErrorFrom(400, null).kind).toBe('invalid');
    expect(detectErrorFrom(500, { error: { message: 'Boom' } })).toEqual({
      kind: 'unknown',
      message: 'Boom',
    });
  });
});

describe('summaries', () => {
  it('formats the result line parts', () => {
    expect(resultSummary(result())).toEqual({
      kindLabel: 'Greenhouse',
      token: 'stripe',
      count: '142 jobs',
    });
    expect(resultSummary(result({ previewCount: 1 })).count).toBe('1 job');
    expect(resultSummary(result({ previewCount: null })).count).toBeNull();
  });
  it('estimates crawl credits per day by interval', () => {
    expect(estimateDailyCredits('1h')).toBe(24);
    expect(estimateDailyCredits('6h', 2)).toBe(8);
    expect(estimateDailyCredits('daily')).toBe(1);
    expect(estimateDailyCredits('weekly')).toBe(1);
  });
});
