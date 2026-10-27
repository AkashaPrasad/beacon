import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildDefaultListings, getStore, resetStore } from './fixtures';
import { feedSummary, filterEntries, listingDetail, markdownToHtml, queryFeed, setFlag } from './query';

function page(qs: string) {
  const result = queryFeed(new URLSearchParams(qs));
  if ('error' in result) throw new Error(result.error);
  return result;
}

beforeEach(() => {
  localStorage.clear();
  resetStore();
});
afterEach(() => {
  localStorage.clear();
  resetStore();
});

describe('radar MSW fixtures', () => {
  it('has at least 60 listings including the edge cases', () => {
    const listings = buildDefaultListings(Date.now());
    expect(listings.length).toBeGreaterThanOrEqual(60);
    const ids = new Set(listings.map((l) => l.id));
    expect(ids.size).toBe(listings.length);
    expect(listings.some((l) => l.deadlineAt === null && l.deadlineKind === 'rolling')).toBe(true);
    expect(listings.some((l) => l.deadlineAt === null && l.deadlineKind === 'unknown')).toBe(true);
    expect(listings.some((l) => l.deadlineAt && l.deadlineAt.getTime() < Date.now())).toBe(true);
    expect(listings.some((l) => /\p{Extended_Pictographic}/u.test(l.title))).toBe(true);
    expect(listings.some((l) => l.company.length > 60)).toBe(true);
  });

  it('paginates with an opaque cursor and reports total on the first page only', () => {
    const first = page('limit=10&minFit=0');
    expect(first.items).toHaveLength(10);
    expect(first.total).toBeGreaterThan(10);
    expect(first.nextCursor).toBeTruthy();
    const second = page(`limit=10&minFit=0&cursor=${first.nextCursor}`);
    expect(second.total).toBeUndefined();
    expect(second.items[0]!.listing.id).not.toBe(first.items[0]!.listing.id);
    expect(queryFeed(new URLSearchParams('cursor=@@'))).toEqual({ error: 'BAD_CURSOR' });
  });

  it('sorts by fit desc by default and excludes expired listings', () => {
    const { items } = page('limit=100&minFit=0');
    const scores = items.map((i) => i.score ?? 0);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(items.some((i) => i.listing.deadlineAt && new Date(i.listing.deadlineAt).getTime() < Date.now())).toBe(
      false,
    );
  });

  it('filters by type, threshold, saved-only and search, and can return 0 matches', () => {
    expect(page('types=hackathon&minFit=0&limit=100').items.every((i) => i.listing.type === 'hackathon')).toBe(true);
    expect(page('minFit=60&limit=100').items.every((i) => (i.score ?? 0) >= 60)).toBe(true);
    expect(page('savedOnly=true&minFit=0&limit=100').items.every((i) => i.saved)).toBe(true);
    expect(page('q=zzzz-no-such-thing').items).toHaveLength(0);
    expect(page('q=zzzz-no-such-thing').total).toBe(0);
  });

  it('hidden listings drop out of the feed until unhidden', () => {
    const first = page('minFit=0&limit=1').items[0]!;
    setFlag(first.listing.id, 'hidden', true);
    expect(filterEntries(new URLSearchParams('minFit=0')).entries.some((e) => e.listing.id === first.listing.id)).toBe(
      false,
    );
    setFlag(first.listing.id, 'hidden', false);
    expect(filterEntries(new URLSearchParams('minFit=0')).entries.some((e) => e.listing.id === first.listing.id)).toBe(
      true,
    );
  });

  it('builds a listing detail with similar listings and sanitised HTML', () => {
    const detail = listingDetail('lst_01_fullstack_intern')!;
    expect(detail.descriptionHtml).toContain('<h3>');
    expect(detail.similar.length).toBeLessThanOrEqual(6);
    expect(listingDetail('nope')).toBeNull();
    expect(markdownToHtml('<script>x</script>')).not.toContain('<script>');
  });

  it('summary counts saved and new listings for a returning user', () => {
    const summary = feedSummary();
    expect(summary.saved).toBeGreaterThan(0);
    expect(summary.warmingUp).toBe(false);
    expect(summary.lastSeenFeedAt).not.toBeNull();
  });

  it('the large scenario has 5,000 listings', () => {
    localStorage.setItem('beacon:mock:radar', 'large');
    resetStore();
    const started = performance.now();
    expect(getStore().entries.size).toBe(5_000);
    // Generation + scoring must stay fast enough for the first MSW response.
    expect(performance.now() - started).toBeLessThan(4_000);
  });

  it('the warming scenario returns unscored items', () => {
    localStorage.setItem('beacon:mock:radar', 'warming');
    resetStore();
    const result = page('limit=20');
    expect(result.warmingUp).toBe(true);
    expect(result.items.every((i) => i.fit === null)).toBe(true);
    expect(feedSummary().warmingUp).toBe(true);
  });
});
