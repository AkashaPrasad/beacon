import { useQueryClient } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { queryKeys } from '@/api/keys';
import { nextPathFor, useGoogleSignIn } from '@/api/me';
import type { MeResponse } from '@/api/types';
import { safeNext } from '@/app/safe-next';
import { consumeOAuthState, oauthRedirectUri } from '@/lib/google-auth';

/** `/auth/callback?code&state` (or `?error=access_denied`) → POST /v1/auth/google → next step. */
export function Component() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const signIn = useGoogleSignIn();
  const qc = useQueryClient();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const error = params.get('error');
    const code = params.get('code');
    const { ok, next } = consumeOAuthState(params.get('state'));
    if (error) {
      void navigate(`/login?error=${error === 'access_denied' ? 'cancelled' : 'failed'}`, {
        replace: true,
      });
      return;
    }
    if (!code || !ok) {
      void navigate('/login?error=expired', { replace: true });
      return;
    }
    signIn.mutate(
      { code, redirectUri: oauthRedirectUri() },
      {
        onSuccess: () => {
          const me = qc.getQueryData<MeResponse | null>(queryKeys.me);
          const target = me ? nextPathFor(me) : '/radar';
          const safe = safeNext(next);
          void navigate(target === '/radar' && safe ? safe : target, { replace: true });
        },
        onError: () => void navigate('/login?error=failed', { replace: true }),
      },
    );
  }, [params, navigate, signIn, qc]);

  return (
    <div
      data-testid="auth-callback-page"
      className="grid min-h-dvh place-items-center bg-bg"
      role="status"
    >
      <div className="flex items-center gap-2 text-body text-fg-secondary">
        <LoaderCircle className="size-4 animate-spin" strokeWidth={1.5} aria-hidden="true" />
        Signing you in…
      </div>
    </div>
  );
}
