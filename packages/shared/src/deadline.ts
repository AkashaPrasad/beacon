/**
 * Deadline parser: turns free-text deadline strings into an instant.
 *
 *   "31st Oct"                         → 31 Oct (year inferred), end of day IST
 *   "Oct 31, 2026 11:59 PM IST"        → 2026-10-31T18:29:00Z
 *   "Oct 1 – Nov 15"                   → 15 Nov (range end)
 *   "in 2 weeks", "next Friday"        → relative to `now`, end of day
 *   "rolling", "ASAP", "until filled"  → { kind: 'rolling' }
 *
 * All calendar maths happens on wall-clock components in the target zone, so results
 * never depend on the host time zone. Default zone: Asia/Kolkata (IST).
 */
import { addDays, addMonths, getDay, getDaysInMonth, lastDayOfMonth } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

import { DEFAULT_TIMEZONE } from './constants';

export type DeadlineParse =
  | { kind: 'date'; at: Date; confidence: number; allDay: boolean }
  | { kind: 'rolling' }
  | { kind: 'unknown' };

export interface ParseDeadlineOptions {
  /** Reference instant for year inference and relative phrases. Default: `new Date()`. */
  now?: Date;
  /** IANA zone or offset ("+05:30") used when the text names none. Default: Asia/Kolkata. */
  timeZone?: string;
}

// ── Internal types ───────────────────────────────────────────────────────────

interface WallDate {
  y: number;
  m: number;
  d: number;
}

interface WallTime {
  h: number;
  min: number;
  s: number;
  ms: number;
}

interface Candidate {
  start: number;
  /** End of the date text itself. */
  end: number;
  /** End including an attached trailing time / zone. */
  extEnd: number;
  y: number | null;
  m: number;
  d: number;
  time: WallTime | null;
  zone: string | null;
  confidence: number;
  monthOnly: boolean;
  rangeStart: Candidate | null;
  isRangeStart: boolean;
  at: Date | null;
}

type Groups = Partial<Record<string, string>>;

const END_OF_DAY: WallTime = { h: 23, min: 59, s: 59, ms: 999 };
const NOON: WallTime = { h: 12, min: 0, s: 0, ms: 0 };

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const WEEKDAYS: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

/** Fixed offsets for explicit standard/daylight abbreviations; IANA names for generic ones. */
const ZONE_ABBREVIATIONS: Record<string, string> = {
  ist: 'Asia/Kolkata',
  utc: 'UTC',
  gmt: 'UTC',
  z: 'UTC',
  pst: '-08:00',
  pdt: '-07:00',
  pt: 'America/Los_Angeles',
  est: '-05:00',
  edt: '-04:00',
  et: 'America/New_York',
  cst: '-06:00',
  cdt: '-05:00',
  ct: 'America/Chicago',
  mst: '-07:00',
  mdt: '-06:00',
  mt: 'America/Denver',
  bst: '+01:00',
  cet: '+01:00',
  cest: '+02:00',
  sgt: '+08:00',
  hkt: '+08:00',
  jst: '+09:00',
  kst: '+09:00',
  aest: '+10:00',
  aedt: '+11:00',
  aoe: '-12:00',
};

// ── Patterns (applied to the normalised, lower-cased text) ───────────────────

const MONTH_SRC = String.raw`(?<mon>jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?(?![a-z])`;
const YEAR_SRC = String.raw`(?<y>(?:19|20)\d{2}|'\d{2})(?![\d:])`;
const RANGE_SEP_SRC = String.raw`\s*(?:-|to|till|until|through|thru|and)\s*`;
const ZONE_SRC = String.raw`(?:utc|gmt)\s*[+-]\s*\d{1,2}(?::?\d{2})?|[+-]\d{2}:?\d{2}|(?:ist|utc|gmt|z|pst|pdt|pt|est|edt|et|cst|cdt|ct|mst|mdt|mt|bst|cet|cest|sgt|hkt|jst|kst|aest|aedt|aoe)(?![a-z])`;
const TIME_SRC = String.raw`(?:(?<h>\d{1,2})(?::(?<min>[0-5]\d))?(?::[0-5]\d)?\s*(?<ap>[ap]\.?m\.?)?(?![a-z])(?:\s*(?:hrs|hours|hr)\b)?|(?<word>noon|midday|midnight))`;

const ISO_RE =
  /(?<!\d)(?<y>\d{4})-(?<m>\d{1,2})-(?<d>\d{1,2})(?:t(?<h>\d{1,2}):(?<min>\d{2})(?::(?<sec>\d{2})(?:\.\d+)?)?(?<z>z|[+-]\d{2}:?\d{2})?)?(?!\d)/g;
const YMD_RE = /(?<![\d./])(?<y>\d{4})[/.](?<m>\d{1,2})[/.](?<d>\d{1,2})(?!\d)/g;
const DMY_RE =
  /(?<![\d./-])(?<a>\d{1,2})(?<sep>[/.-])(?<b>\d{1,2})\k<sep>(?<y>\d{4}|\d{2})(?!\d|[./-]\d)/g;
const DM_RE = new RegExp(
  String.raw`(?<![\d:./a-z])(?<d1>\d{1,2})(?:${RANGE_SEP_SRC}(?<d2>\d{1,2}))?(?:\s+of)?(?:\s+|-)?${MONTH_SRC}(?:(?:\s*,\s*|\s+|-)${YEAR_SRC})?`,
  'g',
);
const MD_RE = new RegExp(
  String.raw`(?<![a-z])${MONTH_SRC}(?:\s+|-)?(?<d1>\d{1,2})(?![\d:])(?:${RANGE_SEP_SRC}(?<d2>\d{1,2})(?![\d:]))?(?:(?:\s*,\s*|\s+|-)${YEAR_SRC})?`,
  'g',
);
const MY_RE = new RegExp(
  String.raw`(?<![a-z\d])${MONTH_SRC}[\s,-]*(?<y>(?:19|20)\d{2})(?![\d:])`,
  'g',
);

const TIME_AFTER_RE = new RegExp(String.raw`^\s*(?:,\s*)?(?:(?:at|by|before|@)\s*)?${TIME_SRC}`);
const ZONE_AFTER_RE = new RegExp(String.raw`^\s*(?:\(\s*)?(?<zone>${ZONE_SRC})\)?`);
const TIME_BEFORE_RE = new RegExp(
  String.raw`(?<![\d:])${TIME_SRC}(?:\s*\(?\s*(?<zone>${ZONE_SRC})\s*\)?)?\s*(?:,|on|of)?\s*$`,
);
const RANGE_CONNECTOR_RE = /^\s*(?:-|to|until|till|through|thru|and|&)\s*$/;
const KEYWORD_RE =
  /(?<![a-z])(?:deadline|due(?:\s+(?:date|by|on))?|apply\s+(?:by|before|until|till)|applications?\s+(?:close[sd]?|due|ends?)(?:\s+on)?|closing(?:\s+date)?|closes(?:\s+on)?|close\s+on|last\s+date(?:\s+(?:to|for)\s+[a-z]+)?|ends?(?:\s+on)?|ending|submissions?(?:\s+(?:deadline|due|close[sd]?))?|submit\s+by|register\s+by|registrations?\s+(?:close[sd]?|ends?)(?:\s+on)?|until|till|before|by)\s*(?:on|is|at)?\s*[:-]?\s*(?:(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?\.?,?\s*)?$/;

const NUM_SRC = String.raw`(?<n>\d{1,3}|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)`;
const UNIT_SRC = String.raw`(?<u>day|week|month)s?`;
const IN_N_RE = new RegExp(String.raw`\b(?:in|within)\s+${NUM_SRC}\s+${UNIT_SRC}\b`, 'g');
const N_LEFT_RE = new RegExp(
  String.raw`\b${NUM_SRC}\s+${UNIT_SRC}\s+(?:left|remaining|to\s+go|from\s+(?:now|today))\b`,
  'g',
);
const TODAY_RE = /\b(?:today|tonight|eod|end\s+of\s+(?:the\s+)?day)\b/;
const TOMORROW_RE = /\btomorrow\b/;
const END_MONTH_RE = /\bend\s+of\s+(?:the\s+|this\s+)?month\b/;
const END_NEXT_MONTH_RE = /\bend\s+of\s+next\s+month\b/;
const END_WEEK_RE = /\bend\s+of\s+(?:the\s+|this\s+)?week\b/;
const NEXT_WEEK_RE = /\bnext\s+week\b/;
const WEEKDAY_RE =
  /\b(?:(?<pre>next|this|coming|by|on|before|until|till)\s+)?(?<wd>monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b\.?/g;
const WEEKDAY_ABBR_SRC = String.raw`(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?`;
const WEEKDAY_RANGE_AFTER_RE = new RegExp(
  String.raw`^\s*(?:-|to|through|thru|till|until)\s*${WEEKDAY_ABBR_SRC}`,
);
const WEEKDAY_RANGE_BEFORE_RE = new RegExp(
  String.raw`${WEEKDAY_ABBR_SRC}\s*(?:-|to|through|thru)\s*$`,
);

const ROLLING_RE =
  /\b(?:rolling|ongoing|asap|as\s+soon\s+as\s+possible|(?:until|till|til)\s+(?:(?:the\s+)?(?:position|positions|role|roles|vacancy|vacancies|post|opening|openings)\s+(?:is|are)\s+)?filled|no\s+deadline|always\s+open|(?:open\s+)?(?:all\s+)?year[\s-]*round|evergreen)\b/;

// ── Helpers ──────────────────────────────────────────────────────────────────

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

function normalise(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‐-―−﹘﹣－]/g, '-')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/(\d)(?:st|nd|rd|th)\b/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveZone(timeZone: string | undefined): string {
  if (!timeZone) return DEFAULT_TIMEZONE;
  if (/^z$/i.test(timeZone)) return 'UTC';
  if (/^[+-]\d{2}:?\d{2}$/.test(timeZone)) return timeZone;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function parseZone(raw: string | undefined): string | null {
  if (!raw) return null;
  const compact = raw.replace(/\s+/g, '');
  const offset = /^(?:utc|gmt)?([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(compact);
  if (offset) {
    const hours = Number(offset[2]);
    const minutes = offset[3] === undefined ? 0 : Number(offset[3]);
    if (hours > 14 || minutes > 59) return null;
    return `${offset[1] ?? '+'}${pad(hours)}:${pad(minutes)}`;
  }
  return ZONE_ABBREVIATIONS[compact] ?? null;
}

function daysIn(y: number, m: number): number {
  return getDaysInMonth(new Date(y, m - 1, 1, 12));
}

function wallToInstant(date: WallDate, time: WallTime, zone: string): Date {
  const local = `${pad(date.y, 4)}-${pad(date.m)}-${pad(date.d)}T${pad(time.h)}:${pad(time.min)}:${pad(time.s)}.${pad(time.ms, 3)}`;
  return fromZonedTime(local, zone);
}

function todayInZone(now: Date, zone: string): WallDate {
  const [y = 1970, m = 1, d = 1] = formatInTimeZone(now, zone, 'yyyy-M-d').split('-').map(Number);
  return { y, m, d };
}

/** Local-noon Date used purely as a calendar cursor (immune to DST edges). */
function calendarCursor(w: WallDate): Date {
  return new Date(w.y, w.m - 1, w.d, 12);
}

function toWall(date: Date): WallDate {
  return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() };
}

function parseYear(raw: string | undefined): number | null | undefined {
  if (raw === undefined) return null;
  const digits = raw.replace("'", '');
  const n = Number(digits);
  const year = digits.length === 2 ? 2000 + n : n;
  return year >= 1970 && year <= 2200 ? year : undefined;
}

function readTime(g: Groups): WallTime | null {
  if (g.word) return g.word === 'midnight' ? END_OF_DAY : NOON;
  if (g.h === undefined || (g.min === undefined && g.ap === undefined)) return null;
  let hours = Number(g.h);
  const minutes = g.min === undefined ? 0 : Number(g.min);
  if (g.ap) {
    if (hours < 1 || hours > 12) return null;
    const pm = g.ap.startsWith('p');
    if (pm && hours < 12) hours += 12;
    if (!pm && hours === 12) hours = 0;
  } else if (hours === 24 && minutes === 0) {
    return END_OF_DAY;
  }
  if (hours > 23) return null;
  return { h: hours, min: minutes, s: 0, ms: 0 };
}

function makeCandidate(
  start: number,
  length: number,
  y: number | null | undefined,
  m: number,
  d: number,
  confidence: number,
): Candidate | null {
  // `undefined` year = present but out of range → reject.
  if (y === undefined || m < 1 || m > 12 || d < 1 || d > daysIn(y ?? 2024, m)) return null;
  return {
    start,
    end: start + length,
    extEnd: start + length,
    y,
    m,
    d,
    time: null,
    zone: null,
    confidence,
    monthOnly: false,
    rangeStart: null,
    isRangeStart: false,
    at: null,
  };
}

function monthOf(token: string | undefined): number {
  return token === undefined ? 0 : (MONTHS[token.slice(0, 3)] ?? 0);
}

// ── Absolute dates ───────────────────────────────────────────────────────────

function collectCandidates(s: string): Candidate[] {
  const raw: Candidate[] = [];
  const push = (c: Candidate | null) => {
    if (c) raw.push(c);
  };

  for (const match of s.matchAll(ISO_RE)) {
    const g: Groups = match.groups ?? {};
    const hasTime = g.h !== undefined;
    const c = makeCandidate(
      match.index,
      match[0].length,
      Number(g.y),
      Number(g.m),
      Number(g.d),
      hasTime || g.z !== undefined ? 1 : 0.95,
    );
    if (c && hasTime) {
      const hours = Number(g.h);
      const minutes = Number(g.min);
      const seconds = g.sec === undefined ? 0 : Number(g.sec);
      // An impossible time ("T25:00") degrades to the date alone.
      if (hours <= 23 && minutes <= 59 && seconds <= 59) {
        c.time = { h: hours, min: minutes, s: seconds, ms: 0 };
      }
    }
    if (c) c.zone = parseZone(g.z);
    push(c);
  }

  for (const match of s.matchAll(YMD_RE)) {
    const g: Groups = match.groups ?? {};
    push(makeCandidate(match.index, match[0].length, Number(g.y), Number(g.m), Number(g.d), 0.95));
  }

  for (const match of s.matchAll(DMY_RE)) {
    const g: Groups = match.groups ?? {};
    const a = Number(g.a);
    const b = Number(g.b);
    let day = a;
    let month = b;
    let confidence = 0.7;
    if (a > 12 || a === b) confidence = 0.95;
    else if (b > 12) {
      day = b;
      month = a;
      confidence = 0.9;
    }
    push(makeCandidate(match.index, match[0].length, parseYear(g.y), month, day, confidence));
  }

  for (const match of s.matchAll(DM_RE)) {
    const g: Groups = match.groups ?? {};
    const year = parseYear(g.y);
    const day = Number(g.d2 ?? g.d1);
    push(makeCandidate(match.index, match[0].length, year, monthOf(g.mon), day, year ? 0.95 : 0.8));
  }

  for (const match of s.matchAll(MD_RE)) {
    const g: Groups = match.groups ?? {};
    const year = parseYear(g.y);
    const day = Number(g.d2 ?? g.d1);
    push(makeCandidate(match.index, match[0].length, year, monthOf(g.mon), day, year ? 0.95 : 0.8));
  }

  for (const match of s.matchAll(MY_RE)) {
    const g: Groups = match.groups ?? {};
    const year = Number(g.y);
    const month = monthOf(g.mon);
    const c = makeCandidate(match.index, match[0].length, year, month, daysIn(year, month), 0.5);
    if (c) c.monthOnly = true;
    push(c);
  }

  // Longest match wins; ties go to the earliest. Then keep non-overlapping spans.
  raw.sort((p, q) => q.end - q.start - (p.end - p.start) || p.start - q.start);
  const accepted: Candidate[] = [];
  for (const c of raw) {
    if (!accepted.some((o) => c.start < o.end && o.start < c.end)) accepted.push(c);
  }
  return accepted.sort((p, q) => p.start - q.start);
}

function attachTimeAndZone(c: Candidate, s: string): void {
  if (c.monthOnly) return;
  let cursor = c.end;
  if (!c.time) {
    const match = TIME_AFTER_RE.exec(s.slice(cursor));
    const time = match ? readTime(match.groups ?? {}) : null;
    if (match && time) {
      c.time = time;
      cursor += match[0].length;
    }
  }
  if (!c.zone) {
    const match = ZONE_AFTER_RE.exec(s.slice(cursor));
    const zone = match ? parseZone(match.groups?.zone) : null;
    if (match && zone) {
      c.zone = zone;
      cursor += match[0].length;
    }
  }
  c.extEnd = cursor;
  if (!c.time) {
    const match = TIME_BEFORE_RE.exec(s.slice(0, c.start));
    const time = match ? readTime(match.groups ?? {}) : null;
    if (match && time) {
      c.time = time;
      c.zone ??= parseZone(match.groups?.zone);
    }
  }
}

function hasDeadlineKeyword(s: string, start: number): boolean {
  return KEYWORD_RE.test(s.slice(Math.max(0, start - 48), start));
}

function latest<T extends { at: Date }>(items: readonly T[]): T | undefined {
  let best: T | undefined;
  for (const item of items) if (!best || item.at.getTime() > best.at.getTime()) best = item;
  return best;
}

function parseAbsolute(s: string, today: WallDate, zone: string): DeadlineParse | null {
  const candidates = collectCandidates(s);
  if (candidates.length === 0) return null;

  for (const c of candidates) attachTimeAndZone(c, s);

  // Link ranges: "<date> – <date>", "<date> to <date>", "between <date> and <date>".
  for (let i = 1; i < candidates.length; i++) {
    const prev = candidates[i - 1];
    const cur = candidates[i];
    if (!prev || !cur || prev.rangeStart) continue;
    if (RANGE_CONNECTOR_RE.test(s.slice(prev.extEnd, cur.start))) {
      cur.rangeStart = prev;
      prev.isRangeStart = true;
    }
  }

  for (const c of candidates) {
    const start = c.rangeStart;
    if (start && c.y === null && start.y !== null) {
      c.y = start.y + (c.m < start.m || (c.m === start.m && c.d < start.d) ? 1 : 0);
      c.confidence = Math.max(c.confidence, 0.95);
    }
  }

  for (const c of candidates) {
    // SPEC rule: a month already passed this year (no year given) means next year.
    const year = c.y ?? (c.m < today.m ? today.y + 1 : today.y);
    c.y = year;
    if (c.d > daysIn(year, c.m)) {
      if (c.rangeStart) c.rangeStart.isRangeStart = false;
      continue;
    }
    c.at = wallToInstant({ y: year, m: c.m, d: c.d }, c.time ?? END_OF_DAY, c.zone ?? zone);
  }

  const effective = candidates.filter(
    (c): c is Candidate & { at: Date } => c.at !== null && !c.isRangeStart,
  );
  const keyworded = effective.filter(
    (c) =>
      hasDeadlineKeyword(s, c.start) ||
      (c.rangeStart !== null && hasDeadlineKeyword(s, c.rangeStart.start)),
  );
  const rangeEnds = effective.filter((c) => c.rangeStart !== null);
  const pool = keyworded.length > 0 ? keyworded : rangeEnds.length > 0 ? rangeEnds : effective;
  const best = latest(pool);
  if (!best) return null;
  return { kind: 'date', at: best.at, confidence: best.confidence, allDay: best.time === null };
}

// ── Relative dates ───────────────────────────────────────────────────────────

function shiftBy(base: Date, amountRaw: string | undefined, unitRaw: string | undefined): Date {
  const raw = amountRaw ?? '1';
  const amount = NUMBER_WORDS[raw] ?? Number(raw);
  if (unitRaw === 'month') return addMonths(base, amount);
  return addDays(base, unitRaw === 'week' ? amount * 7 : amount);
}

function parseRelative(s: string, today: WallDate, zone: string): DeadlineParse | null {
  const base = calendarCursor(today);
  const hits: { at: Date; confidence: number }[] = [];

  if (TODAY_RE.test(s)) hits.push({ at: base, confidence: 0.85 });
  if (TOMORROW_RE.test(s)) hits.push({ at: addDays(base, 1), confidence: 0.85 });
  for (const re of [IN_N_RE, N_LEFT_RE]) {
    for (const match of s.matchAll(re)) {
      const g: Groups = match.groups ?? {};
      hits.push({ at: shiftBy(base, g.n, g.u), confidence: g.u === 'month' ? 0.75 : 0.8 });
    }
  }
  if (END_NEXT_MONTH_RE.test(s)) {
    hits.push({ at: lastDayOfMonth(addMonths(base, 1)), confidence: 0.75 });
  }
  if (END_MONTH_RE.test(s)) hits.push({ at: lastDayOfMonth(base), confidence: 0.75 });
  if (END_WEEK_RE.test(s))
    hits.push({ at: addDays(base, (7 - getDay(base)) % 7), confidence: 0.7 });
  if (NEXT_WEEK_RE.test(s)) hits.push({ at: addDays(base, 7), confidence: 0.7 });

  for (const match of s.matchAll(WEEKDAY_RE)) {
    const g: Groups = match.groups ?? {};
    const word = g.wd ?? '';
    const isFullName = word.endsWith('day');
    if (!g.pre && !isFullName) continue;
    const after = s.slice(match.index + match[0].length);
    const before = s.slice(0, match.index);
    if (WEEKDAY_RANGE_AFTER_RE.test(after) || WEEKDAY_RANGE_BEFORE_RE.test(before)) continue;
    const target = WEEKDAYS[word.slice(0, 3)] ?? 0;
    let delta = (target - getDay(base) + 7) % 7;
    if (delta === 0 && (g.pre === 'next' || g.pre === 'coming')) delta = 7;
    hits.push({ at: addDays(base, delta), confidence: 0.75 });
  }

  const best = latest(hits);
  if (!best) return null;
  return {
    kind: 'date',
    at: wallToInstant(toWall(best.at), END_OF_DAY, zone),
    confidence: best.confidence,
    allDay: true,
  };
}

// ── Public entry point ───────────────────────────────────────────────────────

/**
 * Parse a free-text deadline.
 *
 * - Absolute dates (ISO, D/M/Y, "31 Oct", "Oct 31, 2026 11:59 PM IST", "October 2026")
 *   win over relative phrases, which win over rolling markers.
 * - Ranges resolve to their end. With several dates, one introduced by a deadline keyword
 *   ("apply by", "closes", "last date") is preferred, then a range end, then the latest.
 * - Date-only values resolve to 23:59:59.999 in the zone (`allDay: true`).
 * - Missing year: a month earlier than the current month means next year.
 */
export function parseDeadline(
  text: string | null | undefined,
  options: ParseDeadlineOptions = {},
): DeadlineParse {
  if (!text) return { kind: 'unknown' };
  const s = normalise(text);
  if (!s) return { kind: 'unknown' };

  const zone = resolveZone(options.timeZone);
  const now = options.now && !Number.isNaN(options.now.getTime()) ? options.now : new Date();
  const today = todayInZone(now, zone);

  const absolute = parseAbsolute(s, today, zone);
  if (absolute) return absolute;
  const relative = parseRelative(s, today, zone);
  if (relative) return relative;
  if (ROLLING_RE.test(s)) return { kind: 'rolling' };
  return { kind: 'unknown' };
}
