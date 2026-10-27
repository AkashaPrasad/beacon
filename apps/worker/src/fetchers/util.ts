
import { detectSourceKind } from './detect.js';
import type { FetchSource } from './types.js';
import { SourceError } from '../lib/errors.js';

/** Board token from config, else parsed from the source URL. */
export function boardTokenOf(source: FetchSource): string {
  const token = source.config.boardToken ?? detectSourceKind(source.url).boardToken;
  if (!token) throw new SourceError('notfound', `No board token for ${source.kind} source ${source.url}`);
  return token;
}

/** Display company for single-company boards: the source name without "Careers"/"Jobs". */
export function companyOf(source: FetchSource, fallback?: string | null): string {
  const cleaned = source.name.replace(/\s*[-–|·]?\s*(careers?|jobs?|hiring|job board|openings)\s*$/i, '').trim();
  return cleaned || fallback?.trim() || source.name;
}

/** Re-throws a 404 with a friendlier message that names the board. */
export function rethrowNotFound(err: unknown, what: string): never {
  if (err instanceof SourceError && err.kind === 'notfound') {
    throw new SourceError('notfound', `${what} not found (HTTP ${err.details.status ?? 404}): check the board token`, err.details);
  }
  throw err;
}

export function asArray<T>(value: T | readonly T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? [...(value as T[])] : [value as T];
}

export function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
