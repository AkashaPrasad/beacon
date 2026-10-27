import { OAuth2Client } from 'google-auth-library';

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

export interface GoogleVerifier {
  /** Verify a Google Identity Services ID token (audience = GOOGLE_CLIENT_ID). */
  verifyIdToken(idToken: string): Promise<GoogleIdentity>;
  /** Exchange an OAuth authorization code (redirect flow) and verify the returned ID token. */
  exchangeCode(code: string, redirectUri: string): Promise<GoogleIdentity>;
  /** Google authorization URL for the redirect auth-code flow. */
  authUrl(redirectUri: string, state?: string): string;
}

export const GOOGLE_SCOPES = ['openid', 'email', 'profile'];

export class GoogleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleAuthError';
  }
}

export function createGoogleVerifier(clientId?: string, clientSecret?: string): GoogleVerifier {
  const client = new OAuth2Client({
    ...(clientId ? { clientId } : {}),
    ...(clientSecret ? { clientSecret } : {}),
  });

  async function verifyIdToken(idToken: string): Promise<GoogleIdentity> {
    if (!clientId) throw new GoogleAuthError('GOOGLE_CLIENT_ID is not configured');
    let payload;
    try {
      const ticket = await client.verifyIdToken({ idToken, audience: clientId });
      payload = ticket.getPayload();
    } catch (err) {
      throw new GoogleAuthError((err as Error).message || 'Invalid Google ID token');
    }
    if (!payload?.sub || !payload.email) throw new GoogleAuthError('Google token has no subject or email');
    return {
      sub: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true,
      name: payload.name ?? null,
      picture: payload.picture ?? null,
    };
  }

  return {
    verifyIdToken,
    authUrl(redirectUri, state) {
      if (!clientId) throw new GoogleAuthError('GOOGLE_CLIENT_ID is not configured');
      return client.generateAuthUrl({
        response_type: 'code',
        access_type: 'online',
        scope: GOOGLE_SCOPES,
        redirect_uri: redirectUri,
        prompt: 'select_account',
        include_granted_scopes: true,
        ...(state ? { state } : {}),
      });
    },
    async exchangeCode(code, redirectUri) {
      if (!clientId || !clientSecret) {
        throw new GoogleAuthError('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not configured');
      }
      let idToken: string | null | undefined;
      try {
        const { tokens } = await client.getToken({ code, redirect_uri: redirectUri });
        idToken = tokens.id_token;
      } catch (err) {
        throw new GoogleAuthError((err as Error).message || 'Code exchange failed');
      }
      if (!idToken) throw new GoogleAuthError('Google returned no ID token');
      return verifyIdToken(idToken);
    },
  };
}
