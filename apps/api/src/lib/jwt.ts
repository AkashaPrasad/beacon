import jwt from 'jsonwebtoken';

export const SESSION_COOKIE = 'beacon_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 3600;

export interface SessionClaims {
  sub: string;
  /** Session version; bumping `users.sessionVersion` revokes every outstanding token. */
  sv: number;
}

export function signSession(claims: SessionClaims, secret: string, ttlSeconds = SESSION_TTL_SECONDS): string {
  return jwt.sign({ sv: claims.sv }, secret, {
    algorithm: 'HS256',
    subject: claims.sub,
    expiresIn: ttlSeconds,
    issuer: 'beacon-api',
  });
}

export type VerifyResult =
  | { ok: true; claims: SessionClaims }
  | { ok: false; reason: 'expired' | 'invalid' };

export function verifySession(token: string, secret: string): VerifyResult {
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: 'beacon-api' });
    if (typeof payload === 'string' || typeof payload.sub !== 'string') {
      return { ok: false, reason: 'invalid' };
    }
    const sv = typeof payload['sv'] === 'number' ? payload['sv'] : 0;
    return { ok: true, claims: { sub: payload.sub, sv } };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) return { ok: false, reason: 'expired' };
    return { ok: false, reason: 'invalid' };
  }
}
