import { describe, expect, it } from 'vitest';

import {
  APPROX_FX_PER_USD,
  convertCurrency,
  formatStipend,
  parseStipend,
  toMonthlyAmount,
} from './stipend';

describe('parseStipend', () => {
  it.each([
    [
      '₹25,000/month',
      { min: 25_000, max: 25_000, currency: 'INR', period: 'month', approximate: false },
    ],
    [
      'Rs. 10,000 - 15,000 per month',
      { min: 10_000, max: 15_000, currency: 'INR', period: 'month' },
    ],
    ['INR 15k-20k per month', { min: 15_000, max: 20_000, currency: 'INR', period: 'month' }],
    ['15-20k INR/month', { min: 15_000, max: 20_000, currency: 'INR', period: 'month' }],
    ['₹25000pm', { min: 25_000, max: 25_000, currency: 'INR', period: 'month' }],
    ['₹ 1,20,000 per annum', { min: 120_000, max: 120_000, currency: 'INR', period: 'year' }],
    [
      '12 LPA',
      { min: 1_200_000, max: 1_200_000, currency: 'INR', period: 'year', approximate: true },
    ],
    ['10 - 15 LPA', { min: 1_000_000, max: 1_500_000, period: 'year' }],
    ['₹1.2 lakh/month', { min: 120_000, max: 120_000, period: 'month' }],
    ['CTC ₹2 crore', { min: 20_000_000, period: 'year' }],
    [
      '$80k–$100k',
      { min: 80_000, max: 100_000, currency: 'USD', period: 'year', approximate: true },
    ],
    [
      '$80,000 - $100,000 a year',
      { min: 80_000, max: 100_000, currency: 'USD', period: 'year', approximate: false },
    ],
    ['$40/hr', { min: 40, max: 40, currency: 'USD', period: 'hour' }],
    ['USD 25 per hour', { min: 25, max: 25, currency: 'USD', period: 'hour' }],
    ['$30', { min: 30, max: 30, currency: 'USD', period: 'hour', approximate: true }],
    ['$5,000', { min: 5_000, currency: 'USD', period: 'month', approximate: true }],
    ['€3,000 per month', { min: 3_000, currency: 'EUR', period: 'month' }],
    ['£45,000 - £55,000 a year', { min: 45_000, max: 55_000, currency: 'GBP', period: 'year' }],
    ['S$2,500/month', { currency: 'SGD', period: 'month' }],
    ['Up to €3,000 a month', { min: null, max: 3_000, currency: 'EUR', period: 'month' }],
    ['From ₹15,000/month', { min: 15_000, max: null, currency: 'INR', period: 'month' }],
    ['₹20,000+ per month', { min: 20_000, max: null }],
    ['Stipend: 20000', { min: 20_000, currency: 'INR', period: 'month', approximate: true }],
    ['₹5,000/week', { period: 'week' }],
    ['₹800 per day', { period: 'day' }],
    ['₹5,00,000 prize pool', { min: 500_000, period: 'total' }],
    ['Lump sum of ₹50,000', { min: 50_000, period: 'total' }],
    ['₹25,000/month for 6 months', { min: 25_000, max: 25_000, period: 'month' }],
    ['Stipend 2026: ₹18,000 per month', { min: 18_000, max: 18_000 }],
    ['₹6,00,000', { min: 600_000, period: 'year', approximate: true }],
  ])('%j', (text, expected) => {
    const result = parseStipend(text);
    expect(result.kind).toBe('amount');
    expect(result).toMatchObject(expected);
  });

  it.each([
    ['Unpaid', 'unpaid'],
    ['No stipend', 'unpaid'],
    ['Volunteer role', 'unpaid'],
    ['₹0', 'unpaid'],
    ['Competitive', 'competitive'],
    ['Negotiable', 'competitive'],
    ['As per industry standards', 'competitive'],
    ['Performance-based incentives', 'competitive'],
    ['Paid internship', 'competitive'],
    ['Not disclosed', 'competitive'],
    ['', 'unknown'],
    ['Great learning opportunity', 'unknown'],
    ['6 months', 'unknown'],
  ])('%j → %s', (text, kind) => {
    expect(parseStipend(text).kind).toBe(kind);
  });

  it('uses the default currency when none is stated', () => {
    expect(parseStipend('20000 per month', { defaultCurrency: 'usd' })).toMatchObject({
      currency: 'USD',
      approximate: true,
    });
  });
});

describe('toMonthlyAmount / convertCurrency', () => {
  it.each([
    [10, 'hour', 1_600],
    [1_000, 'day', 21_670],
    [1_200, 'week', 5_200],
    [5_000, 'month', 5_000],
    [120_000, 'year', 10_000],
  ] as const)('%d per %s → %d per month', (amount, period, expected) => {
    expect(toMonthlyAmount(amount, period)).toBeCloseTo(expected, 6);
  });

  it('returns null for one-off totals', () => {
    expect(toMonthlyAmount(50_000, 'total')).toBeNull();
  });

  it('converts through USD and rejects unknown currencies', () => {
    expect(convertCurrency(1, 'USD', 'INR')).toBe(APPROX_FX_PER_USD.INR);
    expect(convertCurrency(88, 'inr', 'usd')).toBeCloseTo(1, 6);
    expect(convertCurrency(100, 'EUR', 'EUR')).toBeCloseTo(100, 6);
    expect(convertCurrency(1, 'XYZ', 'INR')).toBeNull();
    expect(convertCurrency(1, 'INR', 'XYZ')).toBeNull();
  });
});

describe('formatStipend', () => {
  it.each([
    [{ stipendMin: 25_000, stipendMax: 25_000, currency: 'INR', period: 'month' }, '₹25,000/month'],
    [
      { stipendMin: 600_000, stipendMax: 800_000, currency: 'INR', period: 'year' },
      '₹6,00,000–₹8,00,000/year',
    ],
    [
      { stipendMin: 80_000, stipendMax: 100_000, currency: 'USD', period: 'year' },
      '$80,000–$100,000/year',
    ],
    [
      { stipendMin: null, stipendMax: 3_000, currency: 'EUR', period: 'month' },
      'Up to €3,000/month',
    ],
    [
      { stipendMin: 15_000, stipendMax: null, currency: 'INR', period: 'month' },
      'From ₹15,000/month',
    ],
    [{ stipendMin: 10_000, stipendMax: 10_000, currency: 'USD', period: 'total' }, '$10,000'],
    [{ stipendMin: 40, stipendMax: 40, currency: 'CHF', period: 'hour' }, 'CHF 40/hour'],
    [{ stipendMin: 0, stipendMax: 0, currency: 'INR', period: 'month' }, 'Unpaid'],
    [{ stipendMin: 5_000, stipendMax: 5_000 }, '₹5,000'],
    [{ stipendMin: null, stipendMax: null }, null],
    [{}, null],
  ] as const)('%j → %j', (input, expected) => {
    expect(formatStipend(input)).toBe(expected);
  });
});
