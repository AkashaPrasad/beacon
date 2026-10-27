/**
 * Password hashing for email + password sign-in: bcrypt (pure-JS `bcryptjs`, cost 12 by default).
 * bcrypt only reads the first 72 bytes of its input, so longer passwords are refused by the zod
 * rule rather than silently truncated.
 */
import bcrypt from 'bcryptjs';
import { z } from 'zod';

export const DEFAULT_PASSWORD_COST = 12;
const MAX_BCRYPT_BYTES = 72;

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .refine((p) => Buffer.byteLength(p, 'utf8') <= MAX_BCRYPT_BYTES, 'Use at most 72 bytes (about 72 characters)')
  .refine((p) => p.trim().length > 0, 'The password cannot be only spaces');

export function hashPassword(password: string, cost = DEFAULT_PASSWORD_COST): Promise<string> {
  return bcrypt.hash(password, cost);
}

export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | null = null;

/**
 * Compare against a throwaway hash when the account does not exist (or has no password), so a
 * login for an unknown email takes as long as one with a wrong password.
 */
export async function burnPasswordCheck(password: string, cost = DEFAULT_PASSWORD_COST): Promise<void> {
  dummy ??= bcrypt.hash('beacon-timing-equaliser', cost);
  await verifyPassword(password, await dummy);
}
