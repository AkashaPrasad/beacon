/**
 * Typed fetch failure. `kind` drives retry and source health:
 * - auth / notfound / blocked → not retried, source `failing` (bad token, robots.txt disallow)
 * - ratelimited / network     → retried with backoff, source `degraded`
 * - parse                     → not retried, source `degraded` (shape changed)
 * - credits                   → deferred, source `degraded` + healthCode `paused:credits`
 */
export type SourceErrorKind = 'auth' | 'notfound' | 'ratelimited' | 'network' | 'parse' | 'blocked' | 'credits';

export class SourceError extends Error {
  override readonly name = 'SourceError';
  constructor(
    readonly kind: SourceErrorKind,
    message: string,
    readonly details: { status?: number; url?: string; retryAfterMs?: number; cause?: unknown } = {},
  ) {
    super(message);
  }

  get retryable(): boolean {
    return this.kind === 'ratelimited' || this.kind === 'network';
  }
}

export function isSourceError(err: unknown): err is SourceError {
  return err instanceof SourceError;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === 'string' ? err : JSON.stringify(err);
}
