import type { z } from 'zod';

/** Stable error codes returned in `{ error: { code } }` (see docs/API.md §1.4). */
export type ErrorCode =
  | 'VALIDATION'
  | 'BAD_CURSOR'
  | 'BAD_REQUEST'
  | 'UNAUTHENTICATED'
  | 'INVALID_GOOGLE_TOKEN'
  | 'CSRF'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'RESUME_NO_TEXT'
  | 'RESUME_UNREADABLE'
  | 'AI_NOT_CONFIGURED'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL';

export class HttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export type RequestLocation = 'body' | 'query' | 'params';

export interface ValidationIssue {
  path: (string | number)[];
  code: string;
  message: string;
}

export class ValidationError extends HttpError {
  readonly issues: ValidationIssue[];

  constructor(error: z.ZodError, location: RequestLocation) {
    super(400, 'VALIDATION', 'Invalid request', { location });
    this.issues = error.issues.map((issue) => ({
      path: issue.path.map((p) => (typeof p === 'symbol' ? String(p) : p)),
      code: issue.code,
      message: issue.message,
    }));
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, 'BAD_REQUEST', message, details);
export const badCursor = () => new HttpError(400, 'BAD_CURSOR', 'Malformed or mismatched cursor');
export const unauthenticated = (reason: 'missing' | 'expired' | 'invalid' | 'revoked') =>
  new HttpError(
    401,
    'UNAUTHENTICATED',
    reason === 'missing' ? 'Sign in to continue' : 'Your session is no longer valid',
    { reason },
  );
export const forbidden = (message = 'You cannot modify this resource') =>
  new HttpError(403, 'FORBIDDEN', message);
export const notFound = (what = 'Resource') => new HttpError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (message: string, details?: unknown) =>
  new HttpError(409, 'CONFLICT', message, details);
