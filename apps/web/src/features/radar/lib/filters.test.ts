import { describe, expect, it } from 'vitest';

import {
  activeFilterChips,
  activeFilterCount,
  clampMinFit,
  clearFilters,
  DEFAULT_FILTERS,
  DEFAULT_MIN_FIT,
  describeFilters,
  filtersFromSearchParams,
  filtersToFeedQuery,
  filtersToSearchParams,
  isDefaultFilters,
  narrowestFilter,
  viewFromSearchParams,
  type RadarFilters,
} from './filters';

const parse = (qs: string) => filtersFromSearchParams(new URLSearchParams(qs));

describe('filtersFromSearchParams', () => {
  it('returns defaults for an empty query', () => {
    expect(parse('')).toEqual(DEFAULT_FILTERS);
  });

  it('parses every filter', () => {
    const f = parse(
      'q=rust+backend&types=internship,hackathon&deadline=7&remote=remote,hybrid&loc=Bengaluru,Pune' +
        '&stipend=20000&grad=2027&company=Northwind%20Labs&source=src_1&fresh=7&saved=1&minFit=65&sort=deadline',
    );
    expect(f).toEqual<RadarFilters>({
      q: 'rust backend',
      types: ['internship', 'hackathon'],
      deadlineWithin: 7,
      remote: ['remote', 'hybrid'],
      locations: ['Bengaluru', 'Pune'],
      minStipend: 20000,
      gradYear: 2027,
      companies: ['Northwind Labs'],
      sourceIds: ['src_1'],
      postedWithin: 7,
      savedOnly: true,
      showHidden: false,
      newOnly: false,
      minFit: 65,
      sort: 'deadline',
    });
  });

  it('drops unknown and malformed values instead of throwing', () => {
    const f = parse(
      'types=internship,spaceship&deadline=9&remote=moon&grad=abc&fresh=2&sort=random&stipend=-5',
    );
    expect(f.types).toEqual(['internship']);
    expect(f.deadlineWithin).toBeNull();
    expect(f.remote).toEqual([]);
    expect(f.gradYear).toBeNull();
    expect(f.postedWithin).toBeNull();
    expect(f.sort).toBe('fit');
    expect(f.minStipend).toBeNull();
  });

  it('de-duplicates csv values and snaps minFit to steps of 5 within 0..100', () => {
    expect(parse('types=internship,internship').types).toEqual(['internship']);
    expect(parse('minFit=62').minFit).toBe(60);
    expect(parse('minFit=63').minFit).toBe(65);
    expect(parse('minFit=500').minFit).toBe(100);
    expect(parse('minFit=-3').minFit).toBe(0);
    expect(parse('minFit=0').minFit).toBe(0);
    expect(parse('minFit=abc').minFit).toBe(DEFAULT_MIN_FIT);
  });
});

describe('filtersToSearchParams', () => {
  it('omits defaults so /radar stays clean', () => {
    expect(filtersToSearchParams({ ...DEFAULT_FILTERS }).toString()).toBe('');
    expect(isDefaultFilters({ ...DEFAULT_FILTERS })).toBe(true);
  });

  it('round-trips through the URL', () => {
    const filters: RadarFilters = {
      ...DEFAULT_FILTERS,
      q: 'go',
      types: ['research'],
      remote: ['onsite'],
      deadlineWithin: 30,
      minStipend: 50000,
      gradYear: 2026,
      savedOnly: true,
      minFit: 80,
      sort: 'posted',
    };
    expect(filtersFromSearchParams(filtersToSearchParams(filters))).toEqual(filters);
  });

  it('preserves unrelated params such as the view', () => {
    const base = new URLSearchParams('view=board&types=hackathon');
    const next = filtersToSearchParams({ ...DEFAULT_FILTERS, types: ['internship'] }, base);
    expect(next.get('view')).toBe('board');
    expect(next.get('types')).toBe('internship');
    expect(viewFromSearchParams(next)).toBe('board');
    expect(viewFromSearchParams(new URLSearchParams('view=nope'))).toBe('grid');
  });

  it('writes minFit 0 explicitly (it differs from the default)', () => {
    expect(filtersToSearchParams({ ...DEFAULT_FILTERS, minFit: 0 }).get('minFit')).toBe('0');
  });
});

describe('filtersToFeedQuery (API mapping, docs/API.md §6)', () => {
  it('maps the defaults to sort + minFit only', () => {
    expect(filtersToFeedQuery({ ...DEFAULT_FILTERS })).toEqual({
      sort: 'fit',
      minFit: DEFAULT_MIN_FIT,
    });
  });

  it('uses the API parameter names', () => {
    const q = filtersToFeedQuery({
      ...DEFAULT_FILTERS,
      q: '  ml  ',
      types: ['internship', 'hackathon'],
      remote: ['remote'],
      locations: ['Pune'],
      deadlineWithin: 14,
      postedWithin: 1,
      minStipend: 25000,
      gradYear: 2027,
      companies: ['Acme', 'Northwind'],
      sourceIds: ['a', 'b'],
      savedOnly: true,
      minFit: 0,
      sort: 'deadline',
    });
    expect(q).toEqual({
      q: 'ml',
      types: ['hackathon', 'internship'],
      remote: ['remote'],
      locations: ['Pune'],
      deadlineWithinDays: 14,
      postedWithinDays: 1,
      minStipend: 25000,
      stipendCurrency: 'INR',
      gradYear: 2027,
      companies: ['Acme', 'Northwind'],
      sourceIds: ['a', 'b'],
      savedOnly: true,
      sort: 'deadline',
    });
  });

  it('is order-insensitive for multi-selects (one cache entry per filter set)', () => {
    const a = filtersToFeedQuery({ ...DEFAULT_FILTERS, types: ['research', 'internship'] });
    const b = filtersToFeedQuery({ ...DEFAULT_FILTERS, types: ['internship', 'research'] });
    expect(a).toEqual(b);
  });

  it('round-trips URL → filters → API query', () => {
    const query = filtersToFeedQuery(parse('types=hackathon&stipend=10000&minFit=70&saved=1'));
    expect(query).toEqual({
      sort: 'fit',
      types: ['hackathon'],
      minStipend: 10000,
      stipendCurrency: 'INR',
      savedOnly: true,
      minFit: 70,
    });
  });
});

describe('active filter chips and empty-state helpers', () => {
  const narrow: RadarFilters = {
    ...DEFAULT_FILTERS,
    types: ['internship'],
    remote: ['remote'],
    minStipend: 50000,
    gradYear: 2026,
  };

  it('lists each narrowing filter as a removable chip', () => {
    const chips = activeFilterChips(narrow);
    expect(chips.map((c) => c.label)).toEqual(['Internship', 'Remote', '≥ ₹50k/mo', 'Grad 2026']);
    const withoutStipend = chips[2]!.remove(narrow);
    expect(withoutStipend.minStipend).toBeNull();
    expect(withoutStipend.types).toEqual(['internship']);
    expect(activeFilterCount(narrow)).toBe(4);
  });

  it('suggests clearing the stipend floor first (DESIGN §8 #3)', () => {
    expect(narrowestFilter(narrow)).toEqual({ label: 'Clear stipend floor', clear: 'minStipend' });
    expect(narrowestFilter({ ...DEFAULT_FILTERS })).toBeNull();
    expect(describeFilters(narrow)).toBe('Internship + Remote + ₹50k floor + 2026 grads');
  });

  it('clearFilters keeps the threshold and sort', () => {
    const cleared = clearFilters({ ...narrow, minFit: 70, sort: 'posted' });
    expect(cleared).toEqual({ ...DEFAULT_FILTERS, minFit: 70, sort: 'posted' });
  });

  it('clampMinFit handles NaN', () => {
    expect(clampMinFit(Number.NaN)).toBe(DEFAULT_MIN_FIT);
  });
});
