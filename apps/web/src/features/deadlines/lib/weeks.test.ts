import { describe, expect, it } from 'vitest';

import {
  addDays,
  bucketByDay,
  buildWeeks,
  dayKey,
  dayProgress,
  diffDays,
  formatClock,
  formatDayKey,
  formatRange,
  isoWeek,
  isWeekend,
  startOfWeek,
  weekIndexOf,
  weekdayIndex,
} from './weeks';

// Tuesday 27 Oct 2026, 12:00 IST.
const NOW = new Date('2026-10-27T06:30:00.000Z');

describe('day keys in the user time zone', () => {
  it('uses IST by default', () => {
    expect(dayKey(NOW)).toBe('2026-10-27');
    // 23:59 IST on the 27th is 18:29Z, still the 27th in IST.
    expect(dayKey(new Date('2026-10-27T18:29:59.999Z'))).toBe('2026-10-27');
    // 00:30 IST on the 28th is 19:00Z on the 27th.
    expect(dayKey(new Date('2026-10-27T19:00:00.000Z'))).toBe('2026-10-28');
  });

  it('honours another zone', () => {
    expect(dayKey(new Date('2026-10-27T19:00:00.000Z'), 'America/Los_Angeles')).toBe('2026-10-27');
  });

  it('calendar arithmetic crosses months and years', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-10-27', '2026-11-23')).toBe(27);
  });

  it('weeks start on Monday and use ISO numbering', () => {
    expect(weekdayIndex('2026-10-27')).toBe(1); // Tuesday
    expect(startOfWeek('2026-10-27')).toBe('2026-10-26');
    expect(startOfWeek('2026-11-01')).toBe('2026-10-26'); // Sunday belongs to the same week
    expect(isoWeek('2026-10-27')).toBe(44);
    expect(isoWeek('2027-01-01')).toBe(53);
    expect(isWeekend('2026-10-31')).toBe(true);
    expect(isWeekend('2026-10-30')).toBe(false);
  });

  it('formats headers and ranges', () => {
    expect(formatDayKey('2026-10-28')).toBe('Wed 28 Oct');
    expect(formatRange('2026-10-27', '2026-11-23')).toBe('27 Oct – 23 Nov');
  });
});

describe('buildWeeks', () => {
  it('centres on the current week', () => {
    const weeks = buildWeeks('2026-10-27', 2, 5);
    expect(weeks).toHaveLength(8);
    expect(weeks[2]!.offset).toBe(0);
    expect(weeks[2]!.start).toBe('2026-10-26');
    expect(weeks[2]!.days).toHaveLength(7);
    expect(weeks[0]!.start).toBe('2026-10-12');
    expect(weekIndexOf(weeks, '2026-10-27')).toBe(2);
    expect(weekIndexOf(weeks, '2026-11-01')).toBe(2);
    expect(weekIndexOf(weeks, '2026-11-02')).toBe(3);
    expect(weekIndexOf(weeks, '2025-01-01')).toBe(-1);
  });
});

describe('today line', () => {
  it('is positioned by the hour and minute in the zone', () => {
    expect(dayProgress(NOW)).toBeCloseTo(0.5, 5); // 12:00 IST
    expect(dayProgress(new Date('2026-10-27T12:30:00.000Z'))).toBeCloseTo(0.75, 5); // 18:00 IST
    expect(formatClock(new Date('2026-10-27T12:35:00.000Z'))).toBe('18:05');
  });
});

describe('bucketByDay', () => {
  it('groups by IST day, sorts within a day and keeps undated aside', () => {
    const items = [
      { id: 'late', deadlineAt: new Date('2026-10-28T18:00:00.000Z') }, // 23:30 IST 28th
      { id: 'early', deadlineAt: new Date('2026-10-28T04:00:00.000Z') }, // 09:30 IST 28th
      { id: 'rolling', deadlineAt: null },
      { id: 'next', deadlineAt: new Date('2026-10-28T19:00:00.000Z') }, // 00:30 IST 29th
      { id: 'bad', deadlineAt: new Date('nope') },
    ];
    const { byDay, undated } = bucketByDay(items);
    expect(byDay.get('2026-10-28')?.map((i) => i.id)).toEqual(['early', 'late']);
    expect(byDay.get('2026-10-29')?.map((i) => i.id)).toEqual(['next']);
    expect(undated.map((i) => i.id)).toEqual(['rolling', 'bad']);
  });
});
