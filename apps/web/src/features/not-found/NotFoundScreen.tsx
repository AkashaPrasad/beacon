import { EmptyState } from '@kestrel/ui';
import { Compass } from 'lucide-react';
import { Link } from 'react-router';

import { BeaconMark } from '@/components/brand/BeaconMark';
import { Button } from '@/components/ui/button';

/** 404 (any unknown path). Public, so it works signed out too. */
export function Component() {
  return (
    <div data-testid="not-found-page" className="flex min-h-dvh flex-col bg-bg">
      <header className="flex h-topbar items-center px-gutter pt-safe">
        <Link to="/" className="flex items-center gap-2 rounded-sm text-fg focus-visible:focus-ring">
          <BeaconMark className="size-6" />
          <span className="font-display text-[1.25rem] leading-none">Beacon</span>
        </Link>
      </header>
      <main id="main" className="grid flex-1 place-items-center">
        <EmptyState
          variant="page"
          icon={Compass}
          title="Nothing at this address."
          body="The link may be old, or the listing was archived. Your radar has everything that's still open."
          action={
            <Button asChild variant="primary" size="lg">
              <Link to="/radar">Go to Radar</Link>
            </Button>
          }
          secondaryAction={
            <Button asChild variant="ghost" size="lg">
              <Link to="/">Home</Link>
            </Button>
          }
        />
      </main>
    </div>
  );
}
