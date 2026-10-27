import { describe, expect, it } from 'vitest';

import { canonicalKey, contentHash, normaliseCompany, normaliseText, normaliseTitle } from './text';

describe('normaliseText / contentHash', () => {
  it('collapses whitespace and case', () => {
    expect(normaliseText('  Hello\n\tWORLD  ')).toBe('hello world');
  });

  it('hashes equivalent text identically and differing text differently', () => {
    const a = contentHash('Build   dashboards\nwith React');
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(contentHash('build dashboards with react')).toBe(a);
    expect(contentHash('build dashboards with vue')).not.toBe(a);
  });

  it('matches the known sha256 of the normalised text', () => {
    // sha256("abc")
    expect(contentHash('  ABC ')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('applies NFKC so full-width text hashes like ASCII', () => {
    expect(contentHash('ＲＥＡＣＴ')).toBe(contentHash('react'));
  });
});

describe('normaliseCompany', () => {
  it.each([
    ['Acme Technologies Pvt. Ltd.', 'acme'],
    ['Infosys Technologies Limited', 'infosys'],
    ['Zoho Corporation Pvt Ltd', 'zoho'],
    ['Stripe, Inc.', 'stripe'],
    ['Google India Private Limited', 'google india'],
    ['The Walt Disney Company', 'walt disney'],
    ['Johnson & Johnson', 'johnson and johnson'],
    ['Amazon.com, Inc.', 'amazon'],
    ['Société Générale S.A.', 'societe generale'],
    ['Siemens AG', 'siemens'],
    ['Tech Mahindra', 'tech mahindra'],
    ['Scale AI', 'scale ai'],
    ['  McKinsey  &  Company ', 'mckinsey and'],
    ['Inc.', 'inc'],
    ["Byju's", 'byjus'],
    ['🚀 Rocket Labs LLC', 'rocket labs'],
  ])('%s → %s', (input, expected) => {
    expect(normaliseCompany(input)).toBe(expected);
  });

  it('handles very long company names without truncating', () => {
    const long = `${'Very Long Name '.repeat(20)}Private Limited`;
    expect(normaliseCompany(long)).toBe('very long name '.repeat(20).trim());
  });
});

describe('normaliseTitle', () => {
  it.each([
    ['🚀 Software Engineer Intern!!', 'software engineer intern'],
    ['C++ / C# Developer', 'c++ c# developer'],
    ['Data-Science  Intern (2026)', 'data science intern 2026'],
    ['Développeur Front-End', 'developpeur front end'],
  ])('%s → %s', (input, expected) => {
    expect(normaliseTitle(input)).toBe(expected);
  });
});

describe('canonicalKey', () => {
  it('joins company, title and primary city', () => {
    expect(
      canonicalKey({
        company: 'Razorleaf Payments Pvt. Ltd.',
        title: 'SDE Intern 🚀',
        location: ['Bangalore, India', 'Pune'],
      }),
    ).toBe('razorleaf payments|sde intern|bengaluru');
  });

  it('treats city aliases and suffix variants as the same listing', () => {
    const a = canonicalKey({
      company: 'Acme Inc',
      title: 'Backend Engineer',
      location: ['Bengaluru'],
    });
    const b = canonicalKey({
      company: 'ACME',
      title: 'backend engineer',
      location: ['Bangalore, KA'],
    });
    expect(a).toBe(b);
  });

  it.each([
    [{ location: ['Remote - India'] }, 'remote'],
    [{ location: [], remote: 'remote' as const }, 'remote'],
    [{ location: [] }, ''],
    [{ location: ['  ', 'India'] }, 'in'],
    [{ location: ['Somewhere Unknown'] }, 'somewhere unknown'],
    [{}, ''],
  ])('primary location for %j is %j', (extra, expected) => {
    expect(canonicalKey({ company: 'A', title: 'B', ...extra }).split('|')[2]).toBe(expected);
  });
});
