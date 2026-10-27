import { describe, expect, it } from 'vitest';

import { DAY_MS } from '../constants';
import { ghostRisk, type GhostRiskContext, type GhostRiskListing } from './ghost';

const NOW = new Date('2026-10-27T06:30:00.000Z');
const ago = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

describe('ghostRisk (SPEC §3.1 G)', () => {
  it.each<[string, GhostRiskListing, GhostRiskContext, number, string[]]>([
    ['fresh listing', { postedAt: ago(3), lastSeenAt: NOW }, {}, 0, []],
    ['exactly 45 days is fine', { postedAt: ago(45) }, {}, 0, []],
    ['older than 45 days', { postedAt: ago(46) }, {}, 25, ['age']],
    ['older than 90 days', { postedAt: ago(120) }, {}, 35, ['age', 'very_old']],
    ['age falls back to firstSeenAt', { firstSeenAt: ago(60) }, {}, 25, ['age']],
    ['re-posted 3 times', { postedAt: ago(1) }, { repostCount: 3 }, 25, ['reposted']],
    ['re-posted twice is fine', { postedAt: ago(1) }, { repostCount: 2 }, 0, []],
    ['apply link 404', {}, { applyUrlCheck: { status: 404 } }, 35, ['apply_link_dead']],
    ['apply link 410', {}, { applyUrlCheck: { status: 410 } }, 35, ['apply_link_dead']],
    [
      'redirect to careers home',
      {},
      { applyUrlCheck: { status: 200, redirectedToHome: true } },
      30,
      ['apply_link_redirect_home'],
    ],
    ['apply link 503', {}, { applyUrlCheck: { status: 503 } }, 10, ['apply_link_error']],
    [
      'apply link network error',
      {},
      { applyUrlCheck: { status: null, error: 'ECONNRESET' } },
      10,
      ['apply_link_error'],
    ],
    ['apply link healthy', {}, { applyUrlCheck: { status: 200 } }, 0, []],
    [
      'boilerplate in description',
      { descriptionMd: 'We are always accepting applications.' },
      {},
      20,
      ['boilerplate'],
    ],
    ['boilerplate in title', { title: 'Join our Talent Community' }, {}, 20, ['boilerplate']],
    [
      'future opportunities',
      { descriptionMd: 'Submit your CV for future opportunities' },
      {},
      20,
      ['boilerplate'],
    ],
    ['more than 5 identical roles', {}, { identicalOpenRoles: 6 }, 15, ['identical_roles']],
    ['exactly 5 identical roles is fine', {}, { identicalOpenRoles: 5 }, 0, []],
    ['not seen for 15 days', { lastSeenAt: ago(15) }, {}, 15, ['not_seen_recently']],
    [
      'signals add up and cap at 100',
      { postedAt: ago(200), lastSeenAt: ago(30), descriptionMd: 'Evergreen requisition' },
      { repostCount: 5, applyUrlCheck: { status: 404 }, identicalOpenRoles: 12 },
      100,
      [
        'apply_link_dead',
        'age',
        'reposted',
        'boilerplate',
        'identical_roles',
        'not_seen_recently',
        'very_old',
      ],
    ],
  ])('%s', (_label, listing, context, score, codes) => {
    const risk = ghostRisk(listing, { now: NOW, ...context });
    expect(risk.score).toBe(score);
    expect(risk.reasons.map((r) => r.code)).toEqual(codes);
  });

  it('explains each reason with points', () => {
    const risk = ghostRisk({ postedAt: ago(52) }, { now: NOW, repostCount: 4 });
    expect(risk.reasons).toEqual([
      { code: 'age', message: 'Posted 52 days ago', points: 25 },
      { code: 'reposted', message: 'Re-posted 4 times', points: 25 },
    ]);
  });

  it('defaults the clock and context', () => {
    expect(ghostRisk({})).toEqual({ score: 0, reasons: [] });
  });
});
