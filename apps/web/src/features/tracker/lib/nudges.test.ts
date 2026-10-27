import { DAY_MS } from '@kestrel/shared';
import { describe, expect, it } from 'vitest';

import {
  clockStart,
  computeNudge,
  daysBetween,
  nudgeCopy,
  nudgeLabel,
  snoozeFor,
  type NudgeInput,
} from './nudges';

const NOW = new Date('2026-10-27T06:30:00.000Z');
const ago = (days: number, extraMs = 0) => new Date(NOW.getTime() - days * DAY_MS - extraMs);
const ahead = (days: number) => new Date(NOW.getTime() + days * DAY_MS);

function applied(daysAgo: number, extra: Partial<NudgeInput> = {}): NudgeInput {
  return { stage: 'applied', appliedAt: ago(daysAgo), lastActivityAt: ago(daysAgo), ...extra };
}

describe('daysBetween', () => {
  it('floors partial days and never goes negative', () => {
    expect(daysBetween(ago(9, 23 * 3_600_000), NOW)).toBe(9);
    expect(daysBetween(ahead(2), NOW)).toBe(0);
  });
});

describe('applied clock', () => {
  it('stays quiet before 10 days', () => {
    expect(computeNudge(applied(9), NOW)).toBeNull();
  });
  it('nudges a follow-up at exactly 10 days', () => {
    expect(computeNudge(applied(10), NOW)).toEqual({ kind: 'follow_up', days: 10, tone: 'warning' });
  });
  it('keeps the follow-up until day 29, then suggests Ghosted at 30', () => {
    expect(computeNudge(applied(29), NOW)?.kind).toBe('follow_up');
    expect(computeNudge(applied(30), NOW)).toEqual({ kind: 'move_to_ghosted', days: 30, tone: 'danger' });
  });
  it('starts the clock at the later of appliedAt and lastActivityAt', () => {
    const item = applied(40, { lastActivityAt: ago(5) });
    expect(clockStart(item)).toEqual(ago(5));
    expect(computeNudge(item, NOW)).toBeNull();
  });
  it('falls back to lastActivityAt when appliedAt is missing', () => {
    expect(computeNudge({ stage: 'applied', appliedAt: null, lastActivityAt: ago(12) }, NOW)?.kind).toBe(
      'follow_up',
    );
  });
  it('accepts ISO strings (cache / JSON shapes)', () => {
    const iso = ago(11).toISOString();
    expect(computeNudge({ stage: 'applied', appliedAt: iso, lastActivityAt: iso }, NOW)?.days).toBe(11);
  });
});

describe('interview clock', () => {
  const interview = (d: number): NudgeInput => ({ stage: 'interview', appliedAt: ago(60), lastActivityAt: ago(d) });
  it('asks for news after 7 days and suggests Ghosted after 21', () => {
    expect(computeNudge(interview(6), NOW)).toBeNull();
    expect(computeNudge(interview(7), NOW)?.kind).toBe('interview_check');
    expect(computeNudge(interview(21), NOW)?.kind).toBe('move_to_ghosted');
  });
});

describe('deadline reminders', () => {
  it('reminds the day before an OA deadline', () => {
    const oa: NudgeInput = { stage: 'oa', appliedAt: ago(5), lastActivityAt: ago(2), deadlineAt: ahead(0.8) };
    expect(computeNudge(oa, NOW)).toEqual({ kind: 'oa_due', days: 1, tone: 'warning' });
    expect(computeNudge({ ...oa, deadlineAt: ahead(2.5) }, NOW)).toBeNull();
  });
  it('reminds 3 days before an offer deadline, never after it passed', () => {
    const offer: NudgeInput = { stage: 'offer', appliedAt: ago(40), lastActivityAt: ago(1), deadlineAt: ahead(3) };
    expect(computeNudge(offer, NOW)?.kind).toBe('offer_due');
    expect(computeNudge({ ...offer, deadlineAt: ago(1) }, NOW)).toBeNull();
  });
});

describe('stages without a clock', () => {
  it.each(['saved', 'rejected', 'ghosted'] as const)('%s never nudges', (stage) => {
    expect(computeNudge({ stage, appliedAt: ago(90), lastActivityAt: ago(90) }, NOW)).toBeNull();
  });
});

describe('snoozes', () => {
  it('a local snooze silences its kind until it expires', () => {
    const s = snoozeFor('snooze', 'follow_up', ago(1));
    expect(computeNudge(applied(12), NOW, [s])).toBeNull();
    expect(computeNudge(applied(12), ahead(3), [s])?.kind).toBe('follow_up');
  });
  it('"Keep waiting" on the ghosted suggestion falls back to the follow-up nudge', () => {
    const keep = snoozeFor('keep_waiting', 'move_to_ghosted', NOW);
    expect(computeNudge(applied(31), NOW, [keep])?.kind).toBe('follow_up');
  });
  it('"I followed up" quiets every nudge for 7 days', () => {
    const fu = snoozeFor('followed_up', 'follow_up', NOW);
    expect(fu.kind).toBe('*');
    expect(computeNudge(applied(31), NOW, [fu])).toBeNull();
    expect(computeNudge(applied(31), ahead(7.1), [fu])?.kind).toBe('move_to_ghosted');
  });
  it('respects a dismissed or future server-side nudge', () => {
    expect(
      computeNudge(applied(12, { nudges: [{ kind: 'follow_up', dueAt: ago(2), dismissedAt: ago(1) }] }), NOW),
    ).toBeNull();
    expect(computeNudge(applied(12, { nudges: [{ kind: 'follow_up', dueAt: ahead(2) }] }), NOW)).toBeNull();
    expect(
      computeNudge(applied(12, { nudges: [{ kind: 'follow_up', dueAt: ago(2), sentAt: ago(2) }] }), NOW)?.kind,
    ).toBe('follow_up');
  });
});

describe('copy', () => {
  it('uses the DESIGN §8 strings', () => {
    expect(nudgeCopy({ kind: 'follow_up', days: 10, tone: 'warning' }, 'Northwind Labs')).toEqual({
      title: 'No reply from Northwind Labs in 10 days.',
      body: 'A short follow-up often gets one.',
    });
    expect(nudgeCopy({ kind: 'move_to_ghosted', days: 30, tone: 'danger' }, 'X').body).toBe(
      "Most roles that go quiet this long don't come back.",
    );
    expect(nudgeLabel({ kind: 'move_to_ghosted', days: 30, tone: 'danger' })).toBe('Move to Ghosted?');
  });
});
