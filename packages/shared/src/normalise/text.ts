import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

import type { RemoteMode } from '../constants';
import { normaliseLocation } from './location';

const EMOJI = /\p{Extended_Pictographic}|️|‍|⃣/gu;

/** NFKC, lowercase, whitespace collapsed and trimmed: the canonical text form for hashing. */
export function normaliseText(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** sha256 (hex) of `normaliseText(text)`; unchanged descriptions hash identically. */
export function contentHash(text: string): string {
  return bytesToHex(sha256(utf8ToBytes(normaliseText(text))));
}

/** Lowercase ASCII-folded words: diacritics, emoji and punctuation removed. */
function foldWords(text: string, keep = ''): string {
  const strip = new RegExp(`[^\\p{L}\\p{N}${keep}]+`, 'gu');
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(EMOJI, ' ')
    .toLowerCase()
    .replace(strip, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const COMPANY_SUFFIXES = new Set([
  'inc',
  'incorporated',
  'ltd',
  'limited',
  'pvt',
  'private',
  'llc',
  'llp',
  'plc',
  'corp',
  'corporation',
  'co',
  'company',
  'gmbh',
  'ag',
  'sa',
  'sas',
  'srl',
  'bv',
  'nv',
  'pte',
  'pty',
  'oy',
  'ab',
  'kk',
  'technologies',
  'technology',
]);

/**
 * Company identity key: lowercase, diacritics/punctuation stripped, "&" → "and", trailing
 * legal/"Technologies" suffixes removed ("Acme Technologies Pvt. Ltd." → "acme"),
 * leading "the" removed. Never returns an empty string for a non-empty alphanumeric input.
 */
export function normaliseCompany(name: string): string {
  const prepared = name
    .replace(/&/g, ' and ')
    .replace(/\.(com|io|co|in|net|org)\b/gi, ' ')
    .replace(/\b(?:[A-Za-z]\.){2,}/g, (m) => m.replace(/\./g, ''))
    .replace(/['’`]/g, '');
  const tokens = foldWords(prepared).split(' ').filter(Boolean);
  while (tokens.length > 1 && COMPANY_SUFFIXES.has(tokens[tokens.length - 1] ?? '')) tokens.pop();
  if (tokens.length > 1 && tokens[0] === 'the') tokens.shift();
  return tokens.join(' ');
}

/** Title identity key: lowercase, emoji/punctuation stripped (keeps + and # for C++/C#). */
export function normaliseTitle(title: string): string {
  return foldWords(title, '+#');
}

function primaryLocationKey(location: readonly string[] | undefined, remote?: RemoteMode): string {
  const first = location?.find((entry) => entry.trim().length > 0);
  if (!first) return remote === 'remote' ? 'remote' : '';
  const loc = normaliseLocation(first);
  if (loc.city) return loc.city.toLowerCase();
  if (loc.remote === 'remote') return 'remote';
  if (loc.country) return loc.country.toLowerCase();
  return foldWords(first);
}

/**
 * Dedup key (SPEC §9): `normaliseCompany(company)|normaliseTitle(title)|primaryLocation`,
 * where primaryLocation is the first location's city (or "remote", country, folded text).
 */
export function canonicalKey(listing: {
  company: string;
  title: string;
  location?: readonly string[];
  remote?: RemoteMode;
}): string {
  return [
    normaliseCompany(listing.company),
    normaliseTitle(listing.title),
    primaryLocationKey(listing.location, listing.remote),
  ].join('|');
}
