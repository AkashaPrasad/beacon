/** Password rule and strength hint for email sign-up (BRIEF addendum: ≥ 8 characters). */
export const PASSWORD_MIN = 8;

export type StrengthLevel = 0 | 1 | 2 | 3;

const COMMON = new Set([
  'password',
  'password1',
  '12345678',
  '123456789',
  '1234567890',
  'qwertyui',
  'qwerty123',
  'iloveyou',
  '11111111',
  'abcd1234',
  'beacon123',
]);

/**
 * 0 = too short (the only blocking state), 1 = weak, 2 = okay, 3 = strong. A hint, never a gate beyond
 * the minimum: length counts most, then a mix of character kinds.
 */
export function passwordStrength(password: string): { level: StrengthLevel; label: string } {
  if (password.length < PASSWORD_MIN) {
    const left = PASSWORD_MIN - password.length;
    return {
      level: 0,
      label: password ? `${left} more character${left === 1 ? '' : 's'}` : `At least ${PASSWORD_MIN} characters`,
    };
  }
  if (COMMON.has(password.toLowerCase()) || /^(.)\1+$/.test(password)) {
    return { level: 1, label: 'Weak: this one is easy to guess' };
  }
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  const score = kinds + (password.length >= 12 ? 1 : 0) + (password.length >= 16 ? 1 : 0);
  if (score <= 2) return { level: 1, label: 'Weak: add length, numbers or symbols' };
  if (score <= 4) return { level: 2, label: 'Okay' };
  return { level: 3, label: 'Strong' };
}

/** Loose check before we bother the server (the API validates properly). */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
