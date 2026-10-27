import { describe, expect, it } from 'vitest';

import type { CommunityRow, PackDTO, SourceRow } from '@/api/sources';

import { buildRows, displayUrl, matchesQuery, packSummaries, shortPackName } from './rows';


const now = new Date('2026-10-27T06:30:00Z');

function personal(patch: Partial<SourceRow> = {}): SourceRow {
  return {
    id: 'p1',
    url: 'https://boards.greenhouse.io/stripe',
    name: 'Stripe',
    kind: 'greenhouse',
    scope: 'personal',
    ownerId: 'u',
    packId: null,
    typeTag: 'internship',
    enabled: true,
    refreshInterval: '6h',
    health: 'healthy',
    lastCheckedAt: now,
    listingsFound: 142,
    errorReason: null,
    config: { boardToken: 'stripe', feedUrl: null, provider: null },
    etag: null,
    lastModified: null,
    createdAt: now,
    updatedAt: now,
    companyDomain: 'stripe.com',
    ...patch,
  };
}

function community(patch: Partial<CommunityRow> = {}): CommunityRow {
  return {
    ...personal({
      id: 'c1',
      scope: 'community',
      ownerId: null,
      name: 'Razorpay',
      kind: 'firecrawl',
    }),
    packId: 'top-indian-product',
    subscribed: true,
    ...patch,
  };
}

const packs: PackDTO[] = [
  {
    id: 'top-indian-product',
    name: 'Top Indian product companies',
    sourceCount: 48,
    kinds: {},
    optional: false,
    enabled: true,
  },
];

describe('buildRows', () => {
  it('lists personal rows first, then subscribed pack rows with pack names', () => {
    const rows = buildRows(
      [personal()],
      [community(), community({ id: 'c2', subscribed: false })],
      packs,
      'cloud',
    );
    expect(rows.map((r) => r.id)).toEqual(['p1', 'c1']);
    expect(rows[1]).toMatchObject({
      scope: 'pack',
      packName: 'Top Indian product companies',
      editable: false,
      enabled: true,
    });
  });
  it('marks crawled rows paused when credits are out, with the paused code', () => {
    const rows = buildRows([], [community()], packs, 'paused');
    expect(rows[0]).toMatchObject({
      status: 'paused',
      healthCode: 'paused:credits',
      health: 'healthy',
    });
  });
});

describe('helpers', () => {
  it('formats urls and pack names', () => {
    expect(displayUrl('https://www.boards.greenhouse.io/stripe')).toBe(
      'boards.greenhouse.io/stripe',
    );
    expect(shortPackName('YC / early-stage startups hiring interns')).toBe(
      'YC / early-stage startups',
    );
    expect(shortPackName('Hackathons — India & global')).toBe('Hackathons');
  });
  it('filters by name, url, kind and pack', () => {
    const [row] = buildRows([personal()], [], packs, 'cloud');
    expect(matchesQuery(row!, 'strip')).toBe(true);
    expect(matchesQuery(row!, 'greenhouse')).toBe(true);
    expect(matchesQuery(row!, 'lever')).toBe(false);
  });
  it('summarises packs', () => {
    const s = packSummaries([
      community(),
      community({ id: 'c3', companyDomain: 'cred.club', listingsFound: 10 }),
    ]);
    expect(s.get('top-indian-product')).toEqual({
      listings: 152,
      domains: ['stripe.com', 'cred.club'],
      failing: 0,
    });
  });
});
