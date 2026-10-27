import { Check, CircleAlert } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';

import { safeNext } from '@/app/safe-next';
import { BeaconMark } from '@/components/brand/BeaconMark';
import { Button } from '@/components/ui/button';
import { beginGoogleRedirect, createOAuthState } from '@/lib/google-auth';
import { useBrandAccent } from '@/lib/theme/context';
import { useHydrated } from '@/lib/use-hydrated';

import { EmailAuthForm } from './EmailAuthForm';
import { GoogleSignInButton } from './GoogleSignInButton';

const FACTS = [
  'Free. No paywall, no ads, no alert spam.',
  'Your resume stays yours. Export or delete everything, any time.',
  'AI is optional. Use ours, bring your own key, or switch it off.',
];

/** USERFLOW §1.1 states, keyed by `?error=` (set by /auth/callback). */
const ERRORS: Record<string, string> = {
  cancelled: 'Sign-in was cancelled.',
  failed:
    "Google sign-in didn't complete. Try again, or use a different browser if it keeps failing.",
  expired: 'That sign-in link expired or was opened in another tab. Start again from here.',
};

function Facts({ className }: { className?: string }) {
  return (
    <ul className={className}>
      {FACTS.map((fact) => (
        <li key={fact} className="flex gap-2.5 text-body text-fg-secondary">
          <Check
            className="mt-0.5 size-4 shrink-0 text-success"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          {fact}
        </li>
      ))}
    </ul>
  );
}

/**
 * `/login` (DESIGN §6.1 Sign in): Google first (the primary path), then email + password under an
 * "or" divider, with three honest lines beside it. Prerendered, so the query-dependent error only
 * renders after hydration (the static HTML has none).
 */
export function LoginScreen() {
  useBrandAccent();
  const hydrated = useHydrated();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const error = hydrated ? ERRORS[params.get('error') ?? ''] : undefined;

  return (
    <div data-testid="login-page" className="flex min-h-dvh flex-col bg-bg">
      <header className="flex h-14 items-center px-gutter pt-safe">
        <Link
          to="/"
          className="flex items-center gap-2 rounded-sm text-fg focus-visible:focus-ring"
          aria-label="Beacon home"
        >
          <BeaconMark className="size-7 text-accent-strong" />
          <span className="font-display text-[1.375rem] leading-none tracking-[-0.009em]">
            Beacon
          </span>
        </Link>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto grid w-full max-w-5xl flex-1 content-center items-center gap-8 px-gutter pt-4 pb-16 outline-none lg:grid-cols-[1fr_minmax(0,26rem)] lg:gap-x-20"
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <h1 className="font-display text-display text-balance text-fg">
              Sign in to <span className="text-accent-strong">Beacon</span>
            </h1>
            <p className="max-w-prose text-body-lg text-fg-secondary">
              Every opportunity that fits you, ranked against your resume, with the reasons shown.
            </p>
          </div>
          <Facts className="hidden flex-col gap-2.5 lg:flex" />
        </div>

        <section aria-label="Sign in" className="e2 flex flex-col gap-5 rounded-xl p-5 sm:p-6">
          {error && (
            <div
              role="alert"
              data-testid="auth-error"
              className="flex items-start gap-2.5 rounded-md bg-danger-subtle px-3 py-2.5 text-small text-danger"
            >
              <CircleAlert className="mt-px size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
              <p className="flex-1">{error}</p>
              <Button
                variant="link"
                size="sm"
                className="h-auto shrink-0 font-medium text-danger"
                onClick={() => beginGoogleRedirect(createOAuthState(next))}
              >
                Try again
              </Button>
            </div>
          )}
          <GoogleSignInButton next={next} className="w-full" />
          <div className="flex items-center gap-3 text-caption text-fg-tertiary">
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
            or
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
          </div>
          <EmailAuthForm next={next} />
        </section>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <Facts className="flex flex-col gap-2.5 lg:hidden" />
          <p className="text-caption text-fg-tertiary">
            With Google we use your name, email and photo to create your account. Nothing is posted
            anywhere.{' '}
            <Link
              to="/privacy"
              className="text-accent-strong underline underline-offset-3 hover:decoration-2"
            >
              Privacy
            </Link>{' '}
            ·{' '}
            <Link
              to="/terms"
              className="text-accent-strong underline underline-offset-3 hover:decoration-2"
            >
              Terms
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
