import { GoogleOAuthProvider, useGoogleLogin, useGoogleOAuth } from '@react-oauth/google';
import { LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState, type MutableRefObject } from 'react';

import { Button } from '@/components/ui/button';
import { env } from '@/lib/env';
import {
  beginGoogleRedirect,
  createOAuthState,
  GOOGLE_SCOPES,
  oauthRedirectUri,
} from '@/lib/google-auth';
import { cn } from '@/lib/utils';

import { GoogleMark } from './GoogleMark';

type Starter = () => void;

/**
 * Mounted on intent (hover/focus/touch): loads GIS and exposes its redirect code client. The code
 * client is configured once with `state`, so the state is created when GIS mounts, not on click.
 */
function GisLoader({
  starterRef,
  state,
}: {
  starterRef: MutableRefObject<Starter | null>;
  state: string;
}) {
  const login = useGoogleLogin({
    flow: 'auth-code',
    ux_mode: 'redirect',
    redirect_uri: oauthRedirectUri(),
    scope: GOOGLE_SCOPES,
    select_account: true,
    state,
  });
  const { scriptLoadedSuccessfully } = useGoogleOAuth();
  useEffect(() => {
    starterRef.current = scriptLoadedSuccessfully ? login : null;
    return () => {
      starterRef.current = null;
    };
  }, [login, starterRef, scriptLoadedSuccessfully]);
  return null;
}

function GisProvider({
  starterRef,
  state,
}: {
  starterRef: MutableRefObject<Starter | null>;
  state: string;
}) {
  return (
    <GoogleOAuthProvider
      clientId={env.googleClientId}
      onScriptLoadError={() => {
        starterRef.current = null;
      }}
    >
      <GisLoader starterRef={starterRef} state={state} />
    </GoogleOAuthProvider>
  );
}

export interface GoogleSignInButtonProps {
  /** Path to continue to after sign-in (validated on return). */
  next?: string | null;
  className?: string;
  label?: string;
}

/**
 * "Continue with Google" (DESIGN §6.1): `lg` secondary button with the official G. No Google script is
 * loaded until the visitor shows intent, so public pages stay first-party only (Lighthouse, privacy).
 */
export function GoogleSignInButton({
  next = null,
  className,
  label = 'Continue with Google',
}: GoogleSignInButtonProps) {
  const [gisState, setGisState] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const starter = useRef<Starter | null>(null);
  const useGis = Boolean(env.googleClientId) && !env.mockApi;
  const warm = () => {
    if (useGis && !gisState) setGisState(createOAuthState(next));
  };

  // Coming back with the browser's Back button (bfcache) must not leave the button stuck.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(false);
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  const start = () => {
    setBusy(true);
    if (starter.current && gisState) starter.current();
    else beginGoogleRedirect(createOAuthState(next));
  };

  return (
    <>
      <Button
        variant="secondary"
        size="lg"
        data-testid="google-sign-in"
        className={cn('min-w-64 gap-3 font-medium', className)}
        onPointerEnter={warm}
        onFocus={warm}
        onTouchStart={warm}
        onClick={start}
        disabled={busy}
        aria-busy={busy || undefined}
      >
        {busy ? (
          <LoaderCircle
            className="size-5 animate-spin text-fg-secondary"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        ) : (
          <GoogleMark className="size-5" />
        )}
        {busy ? 'Opening Google…' : label}
      </Button>
      {gisState && <GisProvider starterRef={starter} state={gisState} />}
    </>
  );
}
