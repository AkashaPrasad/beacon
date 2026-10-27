import { Check } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';

import { BeaconMark } from '@/components/brand/BeaconMark';
import { safeNext } from '@/app/safe-next';
import { useBrandAccent } from '@/lib/theme/context';

import { GoogleSignInButton } from './GoogleSignInButton';

const FACTS = [
  'Free. No paywall, no ads, no alert spam.',
  'Your resume stays yours. Export or delete everything, any time.',
  'AI is optional. Use ours, bring your own key, or switch it off.',
];

const ERRORS: Record<string, string> = {
  cancelled: 'Sign-in was cancelled.',
  failed: "Google sign-in didn't complete. Try again, or use a different browser if it keeps failing.",
  expired: 'That sign-in link expired. Start again from here.',
};

/** `/login` (DESIGN §6.1 Sign in): calm, the mark, one button, three honest lines. Prerendered. */
export function LoginScreen() {
  useBrandAccent();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const error = ERRORS[params.get('error') ?? ''];

  return (
    <div data-testid="login-page" className="flex min-h-dvh flex-col bg-bg">
      <header className="flex h-14 items-center px-gutter pt-safe">
        <Link to="/" className="flex items-center gap-2 rounded-sm text-fg focus-visible:focus-ring" aria-label="Beacon home">
          <BeaconMark className="size-6" />
          <span className="font-display text-[1.375rem] leading-none">Beacon</span>
        </Link>
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-gutter pb-16">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-display text-fg">Sign in to Beacon</h1>
            <p className="text-body-lg text-fg-secondary">
              Every opportunity that fits you, ranked against your resume, with the reasons shown.
            </p>
          </div>
          {error && (
            <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-small text-danger">
              {error}
            </p>
          )}
          <GoogleSignInButton next={next} className="w-full" />
          <ul className="flex flex-col gap-2.5">
            {FACTS.map((fact) => (
              <li key={fact} className="flex gap-2.5 text-body text-fg-secondary">
                <Check className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={1.5} aria-hidden="true" />
                {fact}
              </li>
            ))}
          </ul>
          <p className="text-caption text-fg-tertiary">
            We use your Google name, email and photo to create your account. Nothing is posted anywhere.
          </p>
        </div>
      </main>
    </div>
  );
}
