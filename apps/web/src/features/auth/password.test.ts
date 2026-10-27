import { describe, expect, it } from 'vitest';

import { looksLikeEmail, passwordStrength } from './password';

describe('passwordStrength', () => {
  it('blocks only below the minimum and counts down', () => {
    expect(passwordStrength('')).toEqual({ level: 0, label: 'At least 8 characters' });
    expect(passwordStrength('abcdefg').label).toBe('1 more character');
    expect(passwordStrength('abcdefgh').level).toBe(1);
  });
  it('rates common and repetitive passwords weak, mixed and long ones strong', () => {
    expect(passwordStrength('Password').level).toBe(1);
    expect(passwordStrength('aaaaaaaaaaaa').level).toBe(1);
    expect(passwordStrength('Kaveri2027').level).toBe(2);
    expect(passwordStrength('monsoon-Hack-2026!').level).toBe(3);
  });
});

describe('looksLikeEmail', () => {
  it('accepts plausible addresses only', () => {
    expect(looksLikeEmail(' nisha@beacon.test ')).toBe(true);
    expect(looksLikeEmail('nisha@beacon')).toBe(false);
    expect(looksLikeEmail('nisha beacon.test')).toBe(false);
  });
});
