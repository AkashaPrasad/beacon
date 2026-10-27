import { describe, expect, it } from 'vitest';

import { parseDeadline, type DeadlineParse } from './deadline';

/** Tuesday 27 Oct 2026, 12:00 IST. */
const NOW = new Date('2026-10-27T06:30:00Z');

/** End of a calendar day in IST (UTC+05:30), as an ISO instant. */
const eodIst = (ymd: string): string => {
  const [y = 0, m = 1, d = 1] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 18, 29, 59, 999)).toISOString();
};

type Expected = { at: string; confidence?: number; allDay?: boolean };

function expectDate(result: DeadlineParse, expected: Expected): void {
  expect(result.kind).toBe('date');
  if (result.kind !== 'date') return;
  expect(result.at.toISOString()).toBe(expected.at);
  if (expected.confidence !== undefined) expect(result.confidence).toBe(expected.confidence);
  if (expected.allDay !== undefined) expect(result.allDay).toBe(expected.allDay);
}

const parse = (text: string | null | undefined, timeZone?: string, now = NOW) =>
  parseDeadline(text, timeZone === undefined ? { now } : { now, timeZone });

describe('parseDeadline: absolute dates (default zone IST)', () => {
  it.each<[string, Expected]>([
    // ISO
    ['2026-10-31', { at: eodIst('2026-10-31'), confidence: 0.95, allDay: true }],
    ['2026-10-31T23:59:00Z', { at: '2026-10-31T23:59:00.000Z', confidence: 1, allDay: false }],
    ['2026-10-31T23:59:00+05:30', { at: '2026-10-31T18:29:00.000Z', confidence: 1 }],
    ['2026-10-31T23:59:30.123-0400', { at: '2026-11-01T03:59:30.000Z', confidence: 1 }],
    ['2026-10-31T23:59', { at: '2026-10-31T18:29:00.000Z', confidence: 1, allDay: false }],
    ['2026-10-31 23:59 IST', { at: '2026-10-31T18:29:00.000Z', allDay: false }],
    ['2026-10-31T25:00', { at: eodIst('2026-10-31'), allDay: true }],
    ['2026/10/31', { at: eodIst('2026-10-31'), confidence: 0.95 }],
    // Numeric D/M/Y (Indian default) and M/D/Y fallback
    ['31/10/2026', { at: eodIst('2026-10-31'), confidence: 0.95 }],
    ['31-10-2026', { at: eodIst('2026-10-31'), confidence: 0.95 }],
    ['31.10.2026', { at: eodIst('2026-10-31'), confidence: 0.95 }],
    ['31/10/26', { at: eodIst('2026-10-31'), confidence: 0.95 }],
    ['10/31/2026', { at: eodIst('2026-10-31'), confidence: 0.9 }],
    ['05/11/2026', { at: eodIst('2026-11-05'), confidence: 0.7 }],
    ['11/11/2026', { at: eodIst('2026-11-11'), confidence: 0.95 }],
    ['31/10/2026 23:59 IST', { at: '2026-10-31T18:29:00.000Z', allDay: false }],
    // Day-month / month-day words
    ['31 Oct', { at: eodIst('2026-10-31'), confidence: 0.8, allDay: true }],
    ['31st Oct', { at: eodIst('2026-10-31'), confidence: 0.8 }],
    ['31 October 2026', { at: eodIst('2026-10-31'), confidence: 0.95 }],
    ['31st Oct, 2026', { at: eodIst('2026-10-31'), confidence: 0.95 }],
    ['31-Oct-2026', { at: eodIst('2026-10-31'), confidence: 0.95 }],
    ["31 Oct '26", { at: eodIst('2026-10-31'), confidence: 0.95 }],
    ['31st of October 2026', { at: eodIst('2026-10-31'), confidence: 0.95 }],
    ['Oct 31', { at: eodIst('2026-10-31'), confidence: 0.8 }],
    ['Oct 31st', { at: eodIst('2026-10-31'), confidence: 0.8 }],
    ['October 31, 2026', { at: eodIst('2026-10-31'), confidence: 0.95 }],
    ['Oct. 31 2026', { at: eodIst('2026-10-31'), confidence: 0.95 }],
    ['Sept 30, 2027', { at: eodIst('2027-09-30'), confidence: 0.95 }],
    ['september 30 2027', { at: eodIst('2027-09-30') }],
    ['Thursday, 31 October 2026', { at: eodIst('2026-10-31'), confidence: 0.95 }],
    ['DEADLINE: 15 NOV 2026', { at: eodIst('2026-11-15'), confidence: 0.95 }],
    ['🚀 Apply by 31st Oct!', { at: eodIst('2026-10-31'), confidence: 0.8 }],
    ['Last date to apply: 15/11/2026', { at: eodIst('2026-11-15') }],
    // Month + year only → last day of month
    ['October 2026', { at: eodIst('2026-10-31'), confidence: 0.5, allDay: true }],
    ['Feb 2028', { at: eodIst('2028-02-29'), confidence: 0.5 }],
    // Explicit past year is returned as-is (the caller decides what "expired" means)
    ['15 Jan 2025', { at: eodIst('2025-01-15'), confidence: 0.95 }],
    ['Feb 29, 2028', { at: eodIst('2028-02-29') }],
  ])('%s', (text, expected) => {
    expectDate(parse(text), expected);
  });
});

describe('parseDeadline: times', () => {
  it.each<[string, Expected]>([
    ['Oct 31, 2026 11:59 PM IST', { at: '2026-10-31T18:29:00.000Z', allDay: false }],
    ['Oct 31, 2026 at 11:59pm', { at: '2026-10-31T18:29:00.000Z', allDay: false }],
    ['Oct 31, 2026 @ 6:00 p.m.', { at: '2026-10-31T12:30:00.000Z' }],
    ['31 Oct 2026 23:59', { at: '2026-10-31T18:29:00.000Z' }],
    ['31 Oct 2026 11 pm', { at: '2026-10-31T17:30:00.000Z' }],
    ['31 Oct 2026 23:59 hrs', { at: '2026-10-31T18:29:00.000Z' }],
    ['31 Oct 2026, 12 am', { at: '2026-10-30T18:30:00.000Z' }],
    ['31 Oct 2026 12:30 a.m.', { at: '2026-10-30T19:00:00.000Z' }],
    ['31 Oct 2026 12 pm', { at: '2026-10-31T06:30:00.000Z' }],
    ['31 Oct 2026 24:00', { at: eodIst('2026-10-31'), allDay: false }],
    ['Oct 31 noon', { at: '2026-10-31T06:30:00.000Z', allDay: false }],
    ['Oct 31 midnight', { at: eodIst('2026-10-31'), allDay: false }],
    ['11:59 PM IST, Oct 31', { at: '2026-10-31T18:29:00.000Z', allDay: false }],
    ['5:00 PM (UTC) on 31 Oct 2026', { at: '2026-10-31T17:00:00.000Z' }],
    ['midnight, 31 Oct 2026', { at: eodIst('2026-10-31'), allDay: false }],
    // Invalid times are ignored, leaving an all-day date
    ['Oct 31, 2026 13 pm', { at: eodIst('2026-10-31'), allDay: true }],
    ['Oct 31, 2026 25:00', { at: eodIst('2026-10-31'), allDay: true }],
  ])('%s', (text, expected) => {
    expectDate(parse(text), expected);
  });
});

describe('parseDeadline: explicit zones override the default', () => {
  it.each<[string, string]>([
    ['Oct 31 2026 23:59 UTC', '2026-10-31T23:59:00.000Z'],
    ['Oct 31 2026 23:59 GMT', '2026-10-31T23:59:00.000Z'],
    ['Oct 31, 2026 5 pm GMT+5:30', '2026-10-31T11:30:00.000Z'],
    ['Oct 31, 2026 5 pm UTC-3', '2026-10-31T20:00:00.000Z'],
    ['Oct 31, 2026 23:59 +0530', '2026-10-31T18:29:00.000Z'],
    ['Oct 31, 2026 23:59 -08:00', '2026-11-01T07:59:00.000Z'],
    ['Oct 31, 2026 11:59 PM PST', '2026-11-01T07:59:00.000Z'],
    ['Oct 31, 2026 11:59 PM PDT', '2026-11-01T06:59:00.000Z'],
    ['Oct 31, 2026 11:59 PM EST', '2026-11-01T04:59:00.000Z'],
    ['Oct 31, 2026 11:59 PM EDT', '2026-11-01T03:59:00.000Z'],
    ['Oct 31, 2026 11:59 PM ET', '2026-11-01T03:59:00.000Z'],
    ['Oct 31, 2026 11:59 PM CST', '2026-11-01T05:59:00.000Z'],
    ['Oct 31, 2026 11:59 PM CDT', '2026-11-01T04:59:00.000Z'],
    ['Oct 31, 2026 11:59 PM CT', '2026-11-01T04:59:00.000Z'],
    ['Oct 31, 2026 11:59 PM MST', '2026-11-01T06:59:00.000Z'],
    ['Oct 31, 2026 11:59 PM MDT', '2026-11-01T05:59:00.000Z'],
    ['Oct 31, 2026 11:59 PM MT', '2026-11-01T05:59:00.000Z'],
    ['Oct 31, 2026 11:59 PM BST', '2026-10-31T22:59:00.000Z'],
    ['Oct 31, 2026 11:59 PM CET', '2026-10-31T22:59:00.000Z'],
    ['Oct 31, 2026 11:59 PM CEST', '2026-10-31T21:59:00.000Z'],
    ['Oct 31, 2026 11:59 PM SGT', '2026-10-31T15:59:00.000Z'],
    ['Oct 31, 2026 11:59 PM HKT', '2026-10-31T15:59:00.000Z'],
    ['Oct 31, 2026 11:59 PM JST', '2026-10-31T14:59:00.000Z'],
    ['Oct 31, 2026 11:59 PM KST', '2026-10-31T14:59:00.000Z'],
    ['Oct 31, 2026 11:59 PM AEST', '2026-10-31T13:59:00.000Z'],
    ['Oct 31, 2026 11:59 PM AEDT', '2026-10-31T12:59:00.000Z'],
    ['Nov 15, 2026 11:59 PM AoE', '2026-11-16T11:59:00.000Z'],
    // A zone right after a date (no time) keeps the date all-day in that zone
    ['31 Oct 2026 UTC', '2026-10-31T23:59:59.999Z'],
    ['31 Oct 2026 (IST)', '2026-10-31T18:29:59.999Z'],
  ])('%s', (text, at) => {
    expectDate(parse(text), { at });
  });

  it('handles DST in generic zones (PT = PDT in July, PST in December)', () => {
    expectDate(parse('Jul 15, 2026 5:00 PM PT'), { at: '2026-07-16T00:00:00.000Z' });
    expectDate(parse('Dec 15, 2026 5:00 PM PT'), { at: '2026-12-16T01:00:00.000Z' });
  });

  it('prefers an explicit zone over the timeZone option', () => {
    expectDate(parse('Oct 31, 2026 11:59 PM IST', 'UTC'), { at: '2026-10-31T18:29:00.000Z' });
  });
});

describe('parseDeadline: ranges resolve to the end date', () => {
  it.each<[string, Expected]>([
    ['Oct 1 – Nov 15', { at: eodIst('2026-11-15'), confidence: 0.8 }],
    ['Oct 1 — Nov 15', { at: eodIst('2026-11-15') }],
    ['Oct 1 - Nov 15, 2026', { at: eodIst('2026-11-15'), confidence: 0.95 }],
    ['Oct 1, 2026 to Nov 15', { at: eodIst('2026-11-15'), confidence: 0.95 }],
    ['Dec 20, 2026 - Jan 10', { at: eodIst('2027-01-10'), confidence: 0.95 }],
    ['1–15 Nov', { at: eodIst('2026-11-15') }],
    ['Nov 1-15', { at: eodIst('2026-11-15') }],
    ['Nov 1 to 15, 2026', { at: eodIst('2026-11-15'), confidence: 0.95 }],
    ['from 1 Oct to 15 Nov', { at: eodIst('2026-11-15') }],
    ['between 10 Oct and 20 Nov', { at: eodIst('2026-11-20') }],
    ['open 1 Oct until 30 Nov 2026', { at: eodIst('2026-11-30') }],
    ['1 Oct 2026 through 2 Nov 2026', { at: eodIst('2026-11-02') }],
    ['Oct 1, 10:00 am – Nov 15, 5 pm', { at: '2026-11-15T11:30:00.000Z', allDay: false }],
    ['01/10/2026 - 15/11/2026', { at: eodIst('2026-11-15') }],
  ])('%s', (text, expected) => {
    expectDate(parse(text), expected);
  });

  it('drops an impossible range end and falls back to the remaining date', () => {
    expectDate(parse('Feb 1 - Feb 30'), { at: eodIst('2027-02-01') });
  });
});

describe('parseDeadline: choosing between several dates', () => {
  it.each<[string, string]>([
    ['Posted Oct 1. Apply by Nov 15', eodIst('2026-11-15')],
    ['Deadline Nov 10; results announced Dec 1, 2026', eodIst('2026-11-10')],
    ['Results on 1 Dec 2026. Applications close on 5 Nov 2026', eodIst('2026-11-05')],
    ['Registration: Oct 1 - Oct 20. Submission deadline: Nov 5', eodIst('2026-11-05')],
    ['Last date: Thursday, 5 November 2026 (event on 20 Nov 2026)', eodIst('2026-11-05')],
    ['Round 1 on 5 Nov; finale on 20 Nov', eodIst('2026-11-20')],
    ['Apply by Nov 10 (extended till Nov 20)', eodIst('2026-11-20')],
    ['Rolling; final deadline 31 Oct', eodIst('2026-10-31')],
    ['Hackathon window: Nov 1 - Nov 3. Kick-off Oct 28', eodIst('2026-11-03')],
  ])('%s', (text, at) => {
    expectDate(parse(text), { at });
  });
});

describe('parseDeadline: year inference (month passed → next year)', () => {
  it.each<[string, string]>([
    ['Feb 15', eodIst('2027-02-15')],
    ['Sept 30', eodIst('2027-09-30')],
    ['Oct 20', eodIst('2026-10-20')], // same month: stays this year (already past)
    ['Nov 15', eodIst('2026-11-15')],
    ['31 Dec', eodIst('2026-12-31')],
  ])('%s', (text, at) => {
    expectDate(parse(text), { at });
  });

  it('infers the year in the target zone, not UTC', () => {
    // 2026-12-31T20:00Z is already 1 Jan 2027 in IST.
    const now = new Date('2026-12-31T20:00:00Z');
    expectDate(parse('Dec 31', undefined, now), { at: eodIst('2027-12-31') });
    expectDate(parse('Dec 31', 'UTC', now), { at: '2026-12-31T23:59:59.999Z' });
  });

  it('rejects Feb 29 when the inferred year is not a leap year', () => {
    expect(parse('Feb 29').kind).toBe('unknown');
    expectDate(parse('Feb 29', undefined, new Date('2027-10-27T06:30:00Z')), {
      at: eodIst('2028-02-29'),
    });
  });
});

describe('parseDeadline: relative phrases', () => {
  it.each<[string, Expected]>([
    ['today', { at: eodIst('2026-10-27'), confidence: 0.85, allDay: true }],
    ['tonight', { at: eodIst('2026-10-27') }],
    ['Apply by EOD', { at: eodIst('2026-10-27') }],
    ['tomorrow', { at: eodIst('2026-10-28'), confidence: 0.85 }],
    ['in 2 weeks', { at: eodIst('2026-11-10'), confidence: 0.8 }],
    ['in two weeks', { at: eodIst('2026-11-10') }],
    ['in 3 days', { at: eodIst('2026-10-30') }],
    ['in 12 days', { at: eodIst('2026-11-08') }],
    ['within 10 days', { at: eodIst('2026-11-06') }],
    ['in a month', { at: eodIst('2026-11-27'), confidence: 0.75 }],
    ['in one month', { at: eodIst('2026-11-27') }],
    ['in eleven months', { at: eodIst('2027-09-27') }],
    ['5 days left', { at: eodIst('2026-11-01'), confidence: 0.8 }],
    ['5 days remaining', { at: eodIst('2026-11-01') }],
    ['a week left', { at: eodIst('2026-11-03') }],
    ['3 weeks to go', { at: eodIst('2026-11-17') }],
    ['2 weeks from now', { at: eodIst('2026-11-10') }],
    ['10 days from today', { at: eodIst('2026-11-06') }],
    ['next Friday', { at: eodIst('2026-10-30'), confidence: 0.75 }],
    ['this Friday', { at: eodIst('2026-10-30') }],
    ['Friday', { at: eodIst('2026-10-30') }],
    ['by Friday', { at: eodIst('2026-10-30') }],
    ['before fri', { at: eodIst('2026-10-30') }],
    ['next sat', { at: eodIst('2026-10-31') }],
    ['next Tuesday', { at: eodIst('2026-11-03') }],
    ['coming Tuesday', { at: eodIst('2026-11-03') }],
    ['this tuesday', { at: eodIst('2026-10-27') }],
    ['on Monday', { at: eodIst('2026-11-02') }],
    ['end of month', { at: eodIst('2026-10-31'), confidence: 0.75 }],
    ['end of the month', { at: eodIst('2026-10-31') }],
    ['end of next month', { at: eodIst('2026-11-30') }],
    ['next week', { at: eodIst('2026-11-03'), confidence: 0.7 }],
    ['end of the week', { at: eodIst('2026-11-01'), confidence: 0.7 }],
    ['Starts today, closes in 2 weeks', { at: eodIst('2026-11-10') }],
  ])('%s', (text, expected) => {
    expectDate(parse(text), expected);
  });

  it('uses the configured zone for "today"', () => {
    // 2026-10-27T20:00Z = 28 Oct 01:30 IST = 27 Oct 16:00 New York.
    const now = new Date('2026-10-27T20:00:00Z');
    expectDate(parse('today', undefined, now), { at: eodIst('2026-10-28') });
    expectDate(parse('today', 'UTC', now), { at: '2026-10-27T23:59:59.999Z' });
    expectDate(parse('today', 'America/New_York', now), { at: '2026-10-28T03:59:59.999Z' });
  });

  it('ignores weekday ranges such as working hours', () => {
    expect(parse('Monday to Friday, 9-6').kind).toBe('unknown');
    expect(parse('Office hours Mon - Fri').kind).toBe('unknown');
  });

  it('prefers an absolute date over a weekday or relative phrase', () => {
    expectDate(parse('Thursday, 5 November 2026'), { at: eodIst('2026-11-05') });
    expectDate(parse('Apply ASAP, in any case before 2 Nov 2026'), {
      at: eodIst('2026-11-02'),
    });
  });
});

describe('parseDeadline: rolling', () => {
  it.each([
    'rolling',
    'Rolling basis',
    'Applications are reviewed on a rolling basis',
    'ongoing',
    'ASAP',
    'Join as soon as possible',
    'until filled',
    'Open till filled',
    'open until the position is filled',
    'until roles are filled',
    'no deadline',
    'Always open',
    'open year-round',
    'Evergreen requisition',
  ])('%s', (text) => {
    expect(parse(text)).toEqual({ kind: 'rolling' });
  });
});

describe('parseDeadline: unknown / garbage', () => {
  it.each<[string | null | undefined]>([
    [null],
    [undefined],
    [''],
    ['   '],
    ['₹25,000 per month'],
    ['2 positions'],
    ['v2.0.1'],
    ['Version 1.2.3'],
    ['+91 98765 43210'],
    ['Call 080-2345-6789'],
    ['2-3 years of experience'],
    ['24/7 support, 50/50 split'],
    ['CGPA 8.5/10'],
    ['Top 10 in March'],
    ['You may apply'],
    ['Oct'],
    ['31/02/2026'],
    ['13/13/2026'],
    ['Feb 30, 2027'],
    ['11:59 PM'],
    ['🚀🔥'],
  ])('%s', (text) => {
    expect(parse(text)).toEqual({ kind: 'unknown' });
  });
});

describe('parseDeadline: options', () => {
  it.each<[string, string]>([
    ['America/New_York', '2026-11-01T03:59:59.999Z'],
    ['UTC', '2026-10-31T23:59:59.999Z'],
    ['Asia/Kolkata', '2026-10-31T18:29:59.999Z'],
    ['+05:30', '2026-10-31T18:29:59.999Z'],
    ['-0800', '2026-11-01T07:59:59.999Z'],
    ['Z', '2026-10-31T23:59:59.999Z'],
    ['Mars/Olympus_Mons', '2026-10-31T18:29:59.999Z'], // invalid → IST default
  ])('timeZone %s', (timeZone, at) => {
    expectDate(parse('Oct 31, 2026', timeZone), { at, allDay: true });
  });

  it('defaults now to the current time and tolerates an invalid now', () => {
    expect(parseDeadline('tomorrow').kind).toBe('date');
    expect(parseDeadline('tomorrow', { now: new Date(Number.NaN) }).kind).toBe('date');
    expectDate(parseDeadline('31 Oct 2026'), { at: eodIst('2026-10-31') });
  });
});
