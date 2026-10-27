import { describe, expect, it } from 'vitest';

import { sampleListings } from '../__fixtures__';
import { type DedupeCandidate, dedupeListings, listingRichness } from './dedupe';
import { cosineSimilarity } from './similarity';
import type { Listing } from '../schemas/listing';

const base = sampleListings[0]!;
const d = (iso: string) => new Date(iso);

describe('dedupeListings', () => {
  it('merges duplicates by canonicalKey, keeping the richest record', () => {
    const sparse: Listing = {
      ...base,
      id: 'sparse',
      descriptionMd: '',
      skillsRequired: [],
      skillsNice: [],
      deadlineAt: null,
      seenCount: 2,
    };
    const rich: Listing = {
      ...base,
      id: 'rich',
      applyUrl: 'https://other.example/job/1',
      seenCount: 3,
    };
    const out = dedupeListings([sparse, rich]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'rich', seenCount: 5 });
  });

  it('merges duplicates whose apply URLs differ only by tracking params', () => {
    const a = {
      canonicalKey: 'a|x|',
      applyUrl: 'https://www.acme.com/jobs/1?utm_source=li',
      seenCount: 1,
    };
    const b = { canonicalKey: 'b|y|', applyUrl: 'https://acme.com/jobs/1/', seenCount: 1 };
    expect(dedupeListings([a, b])).toEqual([{ ...a, seenCount: 2 }]);
  });

  it('merges transitively (key match + URL match)', () => {
    const a: DedupeCandidate = { canonicalKey: 'k1', applyUrl: 'https://a.example/1' };
    const b: DedupeCandidate = { canonicalKey: 'k1', applyUrl: 'https://b.example/2' };
    const c: DedupeCandidate = { canonicalKey: 'k2', applyUrl: 'https://b.example/2?ref=x' };
    const out = dedupeListings([a, b, c]);
    expect(out).toHaveLength(1);
    expect(out[0]?.seenCount).toBe(3);
  });

  it('widens firstSeenAt / lastSeenAt', () => {
    const out = dedupeListings([
      {
        canonicalKey: 'k',
        applyUrl: 'https://a.example/1',
        firstSeenAt: d('2026-10-10'),
        lastSeenAt: d('2026-10-20'),
      },
      {
        canonicalKey: 'k',
        applyUrl: 'https://a.example/2',
        firstSeenAt: d('2026-10-01'),
        lastSeenAt: d('2026-10-25'),
      },
    ]);
    expect(out[0]?.firstSeenAt).toEqual(d('2026-10-01'));
    expect(out[0]?.lastSeenAt).toEqual(d('2026-10-25'));
  });

  it('keeps distinct listings in first-appearance order and tolerates bad URLs', () => {
    const a = { canonicalKey: 'a', applyUrl: 'not a url' };
    const b = { canonicalKey: 'b', applyUrl: 'not a url' };
    expect(dedupeListings([a, b])).toEqual([a, b]);
    expect(dedupeListings(sampleListings)).toHaveLength(sampleListings.length);
    expect(dedupeListings([])).toEqual([]);
  });

  it('breaks richness ties in favour of the first record', () => {
    const a = { canonicalKey: 'k', applyUrl: 'https://a.example/1', note: 'first' };
    const b = { canonicalKey: 'k', applyUrl: 'https://a.example/2', note: 'second' };
    expect(dedupeListings([a, b])[0]?.note).toBe('first');
  });
});

describe('listingRichness', () => {
  it('rewards structured fields', () => {
    expect(listingRichness({})).toBe(0);
    expect(listingRichness(base)).toBeGreaterThan(10);
    const full: Partial<Listing> = {
      ...base,
      eligibility: {
        gradYears: [2026],
        degrees: ['B.Tech'],
        citizenship: ['IN'],
        other: ['x'],
        minExperienceYears: 0,
      },
      descriptionMd: 'x'.repeat(3_500),
      embedding: Array.from({ length: 384 }, () => 0.1),
    };
    expect(listingRichness(full)).toBeGreaterThan(listingRichness(base));
  });
});

describe('cosineSimilarity', () => {
  it.each([
    [[1, 0], [1, 0], 1],
    [[1, 0], [0, 1], 0],
    [[1, 2, 3], [-1, -2, -3], -1],
    [[1, 1], [2, 2], 1],
    [[0, 0], [1, 1], 0],
    [[], [], 0],
    [[1, 2], [1, 2, 3], 0],
  ])('%j · %j = %d', (a, b, expected) => {
    expect(cosineSimilarity(a, b)).toBeCloseTo(expected, 10);
  });

  it('accepts typed arrays', () => {
    expect(cosineSimilarity(new Float32Array([3, 4]), new Float32Array([3, 4]))).toBeCloseTo(1, 6);
  });
});
