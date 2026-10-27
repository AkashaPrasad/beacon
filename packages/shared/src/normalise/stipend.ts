import type { PayPeriod } from '../constants';

export type StipendParse =
  | {
      kind: 'amount';
      min: number | null;
      max: number | null;
      currency: string;
      period: PayPeriod;
      /** True when the currency or the period was inferred rather than stated. */
      approximate: boolean;
    }
  | { kind: 'unpaid' }
  | { kind: 'competitive' }
  | { kind: 'unknown' };

export interface ParseStipendOptions {
  /** Currency assumed when none is stated. Default "INR". */
  defaultCurrency?: string;
}

/**
 * Approximate units per 1 USD, used only to compare a stipend with the student's floor
 * across currencies. Static on purpose (no network); good to ~10%, refreshed by hand.
 */
export const APPROX_FX_PER_USD: Readonly<Record<string, number>> = Object.freeze({
  USD: 1,
  INR: 88,
  EUR: 0.86,
  GBP: 0.75,
  SGD: 1.29,
  AUD: 1.52,
  CAD: 1.39,
  NZD: 1.72,
  AED: 3.67,
  SAR: 3.75,
  QAR: 3.64,
  JPY: 150,
  CNY: 7.1,
  HKD: 7.78,
  KRW: 1_390,
  CHF: 0.8,
  SEK: 9.5,
  NOK: 10.1,
  DKK: 6.4,
  PLN: 3.65,
  BRL: 5.4,
  MXN: 18.5,
  ZAR: 17.6,
  NGN: 1_500,
  KES: 129,
  PKR: 281,
  BDT: 122,
  LKR: 300,
  NPR: 141,
  IDR: 16_300,
  MYR: 4.2,
  PHP: 57,
  THB: 32.5,
  VND: 26_000,
  ILS: 3.3,
  TRY: 41,
});

/** Convert between currencies with `APPROX_FX_PER_USD`; null for unknown currencies. */
export function convertCurrency(amount: number, from: string, to: string): number | null {
  const fromRate = APPROX_FX_PER_USD[from.toUpperCase()];
  const toRate = APPROX_FX_PER_USD[to.toUpperCase()];
  if (fromRate === undefined || toRate === undefined) return null;
  return (amount / fromRate) * toRate;
}

const MONTHLY_FACTOR: Readonly<Record<Exclude<PayPeriod, 'total'>, number>> = {
  hour: 160, // 40 h/week × 4 weeks
  day: 21.67, // 260 working days / 12
  week: 52 / 12,
  month: 1,
  year: 1 / 12,
};

/** Monthly equivalent of an amount; null for one-off ("total") amounts. */
export function toMonthlyAmount(amount: number, period: PayPeriod): number | null {
  return period === 'total' ? null : amount * MONTHLY_FACTOR[period];
}

// ── Parsing ──────────────────────────────────────────────────────────────────

const UNPAID =
  /\b(unpaid|no stipend|without stipend|non[- ]?paid|not paid|zero stipend|volunteer(ing)?( basis| role| position)?|pro bono)\b/;
const COMPETITIVE =
  /\b(competitive|negotiable|as per (industry|company|market) (standards?|norms)|best in (the )?industry|attractive|performance[- ]based|not disclosed|undisclosed|tbd|doe|depending on experience|market rate|paid internship|paid|stipend provided|stipend available)\b/;

/** Currency markers, most specific first. */
const CURRENCIES: readonly (readonly [RegExp, string])[] = [
  [/₹|\brs\.?(?=\s|\d|$)|\binr\b|\brupees?\b/, 'INR'],
  [/\bus\$|\busd\b|\bus dollars?\b/, 'USD'],
  [/\bs\$|\bsgd\b/, 'SGD'],
  [/\ba\$|\baud\b/, 'AUD'],
  [/\bc\$|\bcad\b/, 'CAD'],
  [/\bnz\$|\bnzd\b/, 'NZD'],
  [/\bhk\$|\bhkd\b/, 'HKD'],
  [/€|\beur\b|\beuros?\b/, 'EUR'],
  [/£|\bgbp\b|\bpounds?\b/, 'GBP'],
  [/\baed\b|\bdirhams?\b/, 'AED'],
  [/\bchf\b/, 'CHF'],
  [/\bjpy\b|\byen\b/, 'JPY'],
  [/\bcny\b|\brmb\b|\byuan\b/, 'CNY'],
  [/¥/, 'JPY'],
  [/\$|\bdollars?\b/, 'USD'],
];

const PERIODS: readonly (readonly [RegExp, PayPeriod])[] = [
  [
    /\b(lpa|ctc)\b|(\/|\bper|\ba|\beach)\s*(year|yr|annum)\b|\bannual(ly)?\b|\bp\.?\s?a\b\.?|\bper annum\b|\byearly\b/,
    'year',
  ],
  [
    /(\/|\bper|\ba|\beach)\s*(month|mo|mth|mon)\b|\bmonthly\b|\d\s*(k|l)?\s*(\/-)?\s*p\.?\s?m\b\.?|\bper mensem\b/,
    'month',
  ],
  [/(\/|\bper|\ba|\beach)\s*(week|wk)\b|\bweekly\b/, 'week'],
  [/(\/|\bper|\ban?|\beach)\s*(hour|hr)\b|\bhourly\b|\/h\b/, 'hour'],
  [/(\/|\bper|\ba|\beach)\s*day\b|\bdaily\b|\bper diem\b/, 'day'],
  [
    /\b(lump ?sum|one[- ]?time|in total|total|prize|prizes|prize pool|pool|award|grant|fixed|scholarship amount|worth)\b/,
    'total',
  ],
];

const MULTIPLIERS: Readonly<Record<string, number>> = {
  k: 1_000,
  thousand: 1_000,
  l: 100_000,
  lac: 100_000,
  lacs: 100_000,
  lakh: 100_000,
  lakhs: 100_000,
  lpa: 100_000,
  cr: 10_000_000,
  crore: 10_000_000,
  crores: 10_000_000,
  m: 1_000_000,
  mn: 1_000_000,
  million: 1_000_000,
};

const AMOUNT_RE =
  /(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(k|thousand|lakhs?|lacs?|lpa|l|crores?|cr|million|mn|m)?(?![a-z\d])/g;
const DURATION_AFTER =
  /^\s*[-–]?\s*(months?|weeks?|days?|years?|yrs?|hours?|hrs?|positions?|openings?|seats?|slots?|students?|winners?|teams?|members?)\b/;
const CURRENCY_BEFORE = /(₹|\$|€|£|¥|\brs\.?|\binr|\busd|\beur|\bgbp|\bsgd|\baud|\bcad|\baed)\s*$/;

interface Amount {
  value: number;
  index: number;
  end: number;
  multiplier: number | null;
  currencyAdjacent: boolean;
}

function findAmounts(s: string): Amount[] {
  const out: Amount[] = [];
  for (const m of s.matchAll(AMOUNT_RE)) {
    const digits = m[1] ?? '';
    const unit = m[2];
    const index = m.index;
    const end = index + m[0].length;
    if (DURATION_AFTER.test(s.slice(end)) && !unit) continue;
    const base = Number(digits.replace(/,/g, ''));
    if (!Number.isFinite(base)) continue;
    const before = s.slice(Math.max(0, index - 6), index);
    const currencyAdjacent = CURRENCY_BEFORE.test(before);
    // Skip calendar years ("2026") unless they are clearly money.
    if (!unit && !currencyAdjacent && /^(19|20)\d{2}$/.test(digits)) continue;
    const multiplier = unit ? (MULTIPLIERS[unit] ?? null) : null;
    out.push({ value: base * (multiplier ?? 1), index, end, multiplier, currencyAdjacent });
  }
  return out;
}

function detectCurrency(s: string): string | null {
  for (const [re, code] of CURRENCIES) if (re.test(s)) return code;
  return null;
}

function detectPeriod(s: string): PayPeriod | null {
  for (const [re, period] of PERIODS) if (re.test(s)) return period;
  return null;
}

function inferPeriod(amount: number, currency: string): PayPeriod {
  const monthlyUsd = convertCurrency(amount, currency, 'USD') ?? amount;
  if (monthlyUsd < 200 && currency !== 'INR') return 'hour';
  if (currency === 'INR') return amount >= 300_000 ? 'year' : 'month';
  return monthlyUsd >= 15_000 ? 'year' : 'month';
}

/**
 * Parse stipend / salary text: "₹25,000/month", "$80k–$100k", "INR 15k-20k per month",
 * "12 LPA", "Up to €3,000 a month", "unpaid", "competitive".
 */
export function parseStipend(text: string, options: ParseStipendOptions = {}): StipendParse {
  const defaultCurrency = (options.defaultCurrency ?? 'INR').toUpperCase();
  const s = text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/(\d)([a-z])/g, '$1 $2') // "25000pm" → "25000 pm", "15k" → "15 k"
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return { kind: 'unknown' };
  if (UNPAID.test(s)) return { kind: 'unpaid' };

  const amounts = findAmounts(s);
  if (amounts.length === 0) {
    return COMPETITIVE.test(s) ? { kind: 'competitive' } : { kind: 'unknown' };
  }

  // Anchor on the first amount that is clearly money (currency symbol or unit), then
  // pair it with an adjacent amount when the two form a range ("₹10,000 - 15,000", "15-20k").
  const anchorIndex = Math.max(
    0,
    amounts.findIndex((a) => a.currencyAdjacent || a.multiplier !== null),
  );
  const isRange = (a: Amount, b: Amount) =>
    /^\s*(-|–|—|to|and|upto|up to|~)\s*(₹|\$|€|£|rs\.?|inr|usd|eur|gbp)?\s*$/.test(
      s.slice(a.end, b.index),
    );
  const anchor = amounts[anchorIndex] as Amount;
  const before = amounts[anchorIndex - 1];
  const after = amounts[anchorIndex + 1];
  let pair: readonly [Amount, Amount] | null = null;
  if (before && isRange(before, anchor)) pair = [before, anchor];
  else if (after && isRange(anchor, after)) pair = [anchor, after];

  const first = pair ? pair[0] : anchor;
  let min: number | null = first.value;
  let max: number | null = min;
  if (pair) {
    const [low, high] = pair;
    let lowValue = low.value;
    // "15-20k": the unit on the upper bound applies to the lower bound too.
    if (low.multiplier === null && high.multiplier !== null && low.value < 1_000) {
      lowValue = low.value * high.multiplier;
    }
    min = Math.min(lowValue, high.value);
    max = Math.max(lowValue, high.value);
  }

  const head = s.slice(Math.max(0, first.index - 16), first.index);
  if (min !== null && max === min) {
    if (
      /\b(up ?to|upto|max(imum)?|not more than|till)\s*(₹|\$|€|£|rs\.?|inr|usd)?\s*$/.test(head)
    ) {
      min = null;
    } else if (
      /\b(from|starting( at| from)?|min(imum)?|at least|atleast)\s*(₹|\$|€|£|rs\.?|inr|usd)?\s*$/.test(
        head,
      ) ||
      /^\s*\+/.test(s.slice(first.end))
    ) {
      max = null;
    }
  }

  const statedCurrency = detectCurrency(s);
  const currency = statedCurrency ?? defaultCurrency;
  const statedPeriod = detectPeriod(s);
  const reference = max ?? min ?? 0;
  const period = statedPeriod ?? inferPeriod(reference, currency);

  if (reference === 0 && (min ?? 0) === 0) return { kind: 'unpaid' };

  return {
    kind: 'amount',
    min,
    max,
    currency,
    period,
    approximate: statedCurrency === null || statedPeriod === null,
  };
}

// ── Formatting ───────────────────────────────────────────────────────────────

const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  SGD: 'S$',
  AUD: 'A$',
  CAD: 'C$',
};

const PERIOD_SUFFIX: Readonly<Record<PayPeriod, string>> = {
  hour: '/hour',
  day: '/day',
  week: '/week',
  month: '/month',
  year: '/year',
  total: '',
};

function formatAmount(amount: number, currency: string): string {
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  return new Intl.NumberFormat(locale, { maximumFractionDigits: amount < 100 ? 2 : 0 }).format(
    amount,
  );
}

/**
 * Human stipend label: "₹25,000/month", "$80,000–$100,000/year", "Up to €3,000/month",
 * "From ₹15,000/month". Returns null when there is no amount.
 */
export function formatStipend(stipend: {
  stipendMin?: number | null;
  stipendMax?: number | null;
  currency?: string | null;
  period?: PayPeriod | null;
}): string | null {
  const { stipendMin: min = null, stipendMax: max = null } = stipend;
  if (min === null && max === null) return null;
  if (max === 0 && (min ?? 0) === 0) return 'Unpaid';
  const currency = (stipend.currency ?? 'INR').toUpperCase();
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const suffix = stipend.period ? PERIOD_SUFFIX[stipend.period] : '';
  const fmt = (n: number) => `${symbol}${formatAmount(n, currency)}`;
  if (min !== null && max !== null) {
    return `${min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`}${suffix}`;
  }
  if (max !== null) return `Up to ${fmt(max)}${suffix}`;
  return `From ${fmt(min ?? 0)}${suffix}`;
}
