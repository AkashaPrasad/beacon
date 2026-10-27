import { describe, expect, it } from 'vitest';

import {
  daysSince,
  formatAbsolute,
  formatCount,
  formatDayMonth,
  formatRelative,
  formatShortDate,
  formatTime,
  fromDateInputValue,
  toDateInputValue,
} from './format';

const NOW = new Date('2026-10-27T06:30:00.000Z');

describe('format', () => {
  it('relative times', () => {
    expect(formatRelative(new Date(NOW.getTime() - 12 * 60_000), NOW)).toBe('12 min ago');
    expect(formatRelative(new Date(NOW.getTime() - 3 * 3_600_000), NOW)).toBe('3 h ago');
    expect(formatRelative(new Date(NOW.getTime() + 3 * 86_400_000), NOW)).toBe('in 3d');
    expect(formatRelative(null, NOW)).toBe('—');
  });
  it('dates in IST', () => {
    expect(formatShortDate(NOW)).toBe('Tue 27 Oct');
    expect(formatDayMonth('2026-10-14T06:00:00Z')).toBe('14 Oct');
    expect(formatAbsolute('2026-10-28T18:29:00Z')).toBe('Wed 28 Oct, 23:59 IST');
    expect(formatTime(Date.parse('2026-10-27T05:12:00Z'))).toBe('10:42');
    expect(formatTime(Number.NaN)).toBe('—');
  });
  it('date inputs round-trip', () => {
    expect(toDateInputValue(NOW)).toBe('2026-10-27');
    expect(toDateInputValue(fromDateInputValue('2026-10-14'))).toBe('2026-10-14');
    expect(fromDateInputValue('14/10/2026')).toBeNull();
  });
  it('counts and days', () => {
    expect(formatCount(123456)).toBe('1,23,456');
    expect(daysSince(new Date(NOW.getTime() - 10.5 * 86_400_000), NOW)).toBe(10);
  });
});
