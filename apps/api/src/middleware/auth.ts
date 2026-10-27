import type { RequestHandler, Response, Request } from 'express';
import type { Types } from 'mongoose';

import type { AppContext } from '../context.js';
import { HttpError, unauthenticated } from '../lib/errors.js';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, verifySession } from '../lib/jwt.js';
import { isObjectId } from '../lib/validate.js';
import { User, type UserDoc } from '../models/user.js';

export interface AuthUser {
  id: string;
  _id: Types.ObjectId;
  doc: UserDoc;
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() ?? null;
}

export function sessionToken(req: Request): string | null {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  return cookies?.[SESSION_COOKIE] ?? bearerToken(req);
}

/** Reads the `beacon_session` cookie (or `Authorization: Bearer`), verifies it and attaches `req.user`. */
export function requireAuth(ctx: AppContext): RequestHandler {
  return async (req, _res, next) => {
    const token = sessionToken(req);
    if (!token) throw unauthenticated('missing');
    const result = verifySession(token, ctx.jwtSecret);
    if (!result.ok) throw unauthenticated(result.reason);
    if (!isObjectId(result.claims.sub)) throw unauthenticated('invalid');
    const user = await User.findById(result.claims.sub).lean<UserDoc>();
    if (!user || (user.sessionVersion ?? 0) !== result.claims.sv) throw unauthenticated('revoked');
    req.user = { id: user._id.toString(), _id: user._id, doc: user };
    next();
  };
}

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue', { reason: 'missing' });
  return req.user;
}

export function setSessionCookie(ctx: AppContext, res: Response, user: Pick<UserDoc, '_id' | 'sessionVersion'>): string {
  const token = signSession({ sub: user._id.toString(), sv: user.sessionVersion ?? 0 }, ctx.jwtSecret);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: ctx.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS * 1000,
  });
  return token;
}

export function clearSessionCookie(ctx: AppContext, res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: ctx.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

const CSRF_VALUES = new Set(['beacon', 'kestrel']);
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF guard for cookie sessions: mutating requests must carry `X-Requested-With: beacon`
 * (a header a cross-site form cannot set). Bearer-authenticated requests are exempt.
 */
export const csrfGuard: RequestHandler = (req, _res, next) => {
  if (!MUTATING.has(req.method)) return next();
  if (bearerToken(req) && !sessionTokenFromCookie(req)) return next();
  const value = req.get('x-requested-with')?.trim().toLowerCase();
  if (!value || !CSRF_VALUES.has(value)) {
    throw new HttpError(403, 'CSRF', 'Missing or invalid X-Requested-With header');
  }
  next();
};

function sessionTokenFromCookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  return cookies?.[SESSION_COOKIE];
}
