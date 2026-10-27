import { describe, expect, it } from 'vitest';

import { normaliseUrl, tryNormaliseUrl } from './url';

describe('normaliseUrl', () => {
  it.each([
    ['https://WWW.Example.com/Jobs/', 'https://example.com/Jobs'],
    ['example.com/careers', 'https://example.com/careers'],
    ['//example.com/a', 'https://example.com/a'],
    ['http://example.com/a', 'https://example.com/a'],
    ['https://example.com/', 'https://example.com'],
    ['https://example.com', 'https://example.com'],
    ['https://example.com/a#apply', 'https://example.com/a'],
    ['https://example.com//a///b/', 'https://example.com/a/b'],
    ['https://user:pass@example.com/a', 'https://example.com/a'],
    ['https://example.com:443/a', 'https://example.com/a'],
    ['https://example.com:8443/a', 'https://example.com:8443/a'],
    ['https://www2.example.com/a', 'https://example.com/a'],
    // tracking + session params
    [
      'https://jobs.lever.co/acme/123?utm_source=li&utm_medium=social&lever-source=x&gh_src=y',
      'https://jobs.lever.co/acme/123',
    ],
    ['https://example.com/a?fbclid=1&gclid=2&msclkid=3&ref=hn&ref_src=tw', 'https://example.com/a'],
    ['https://example.com/a?sessionid=abc&JSESSIONID=1&PHPSESSID=2&sid=3', 'https://example.com/a'],
    ['https://example.com/a;jsessionid=ABC123?id=7', 'https://example.com/a?id=7'],
    // query sorted, meaningful params kept
    ['https://example.com/a?b=2&a=1&utm_campaign=z', 'https://example.com/a?a=1&b=2'],
    ['https://example.com/a?a=2&a=1', 'https://example.com/a?a=1&a=2'],
    [
      'https://boards.greenhouse.io/embed/job_app?token=123&for=stripe',
      'https://boards.greenhouse.io/embed/job_app?for=stripe&token=123',
    ],
    ['  https://example.com/a  ', 'https://example.com/a'],
  ])('%s → %s', (input, expected) => {
    expect(normaliseUrl(input)).toBe(expected);
  });

  it('keeps http for localhost and when forceHttps is false', () => {
    expect(normaliseUrl('http://localhost:5173/x/')).toBe('http://localhost:5173/x');
    expect(normaliseUrl('http://example.com/a', { forceHttps: false })).toBe(
      'http://example.com/a',
    );
  });

  it('makes duplicate URLs with different params identical', () => {
    const a = normaliseUrl('https://www.acme.com/jobs/42/?utm_source=linkedin&ref=feed');
    const b = normaliseUrl('acme.com/jobs/42#top');
    expect(a).toBe(b);
  });

  it.each(['', '   ', 'mailto:jobs@example.com', 'ftp://example.com/x', 'http://'])(
    'rejects %j',
    (input) => {
      expect(() => normaliseUrl(input)).toThrow(TypeError);
      expect(tryNormaliseUrl(input)).toBeNull();
    },
  );

  it('tryNormaliseUrl returns the normalised URL when valid', () => {
    expect(tryNormaliseUrl('Example.com/A/')).toBe('https://example.com/A');
  });
});
