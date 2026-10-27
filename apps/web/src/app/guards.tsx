import { Navigate, Outlet, useLocation } from 'react-router';

import { isOnboarded, nextPathFor, useMe } from '@/api/me';
import { sessionHint } from '@/lib/storage';

import { FullPageError, ShellSkeleton } from './boot-screens';
import { safeNext } from './safe-next';

/** Signed-in routes. Anonymous visitors go to `/login?next=<here>`. */
export function RequireAuth() {
  const { data: me, isPending, isError, error, refetch } = useMe();
  const location = useLocation();
  if (isPending) return <ShellSkeleton />;
  if (isError && !me) return <FullPageError error={error} onRetry={() => void refetch()} />;
  if (!me) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <Outlet />;
}

/** App routes need consent and a finished onboarding; otherwise resume where the user left off. */
export function RequireOnboarded() {
  const { data: me } = useMe();
  if (!me) return null;
  if (!me.onboarding.consent || me.onboarding.step === 'consent') return <Navigate to="/welcome" replace />;
  if (!isOnboarded(me)) return <Navigate to={nextPathFor(me)} replace />;
  return <Outlet />;
}

/** Onboarding steps need consent first. */
export function RequireConsent() {
  const { data: me } = useMe();
  if (!me) return null;
  if (!me.onboarding.consent) return <Navigate to="/welcome" replace />;
  return <Outlet />;
}

/**
 * Public pages (landing, login). Signed-in visitors are redirected (`/` → `/radar`, or to consent /
 * onboarding when unfinished). `/v1/me` is only called when a session is likely (no 401 noise).
 */
export function PublicOnly() {
  const { data: me } = useMe({ enabled: sessionHint.get() });
  const location = useLocation();
  if (me) {
    const next = safeNext(new URLSearchParams(location.search).get('next'));
    const target = nextPathFor(me);
    return <Navigate to={target === '/radar' && next ? next : target} replace />;
  }
  return <Outlet />;
}

/** `/onboarding` without a step: consent first, then the saved step. */
export function OnboardingIndex() {
  const { data: me } = useMe();
  if (!me) return null;
  return <Navigate to={nextPathFor(me) === '/radar' ? '/onboarding/resume' : nextPathFor(me)} replace />;
}
