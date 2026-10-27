import { ArrowLeft, Radar } from 'lucide-react';
import { Link } from 'react-router';

import { BeaconMark } from '@/components/brand/BeaconMark';
import { Button } from '@/components/ui/button';
import { Band, Container } from '@/features/marketing/components/Atmosphere';
import { MarketingFooter, MarketingNav } from '@/features/marketing/components/MarketingLayout';

import '@/features/marketing/marketing.css';

/** 404 (any unknown path). Public, so it works signed out too; the beam looks, finds nothing. */
export function Component() {
  return (
    <div data-testid="not-found-page" className="flex min-h-dvh flex-col bg-bg text-fg">
      <MarketingNav />
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
        <Band
          tone="night"
          lamp={{ x: '20%', y: '30%' }}
          beam
          beamDir={20}
          beamSwing={30}
          className="flex flex-1 items-center"
        >
          <Container className="grid gap-10 py-24 md:grid-cols-[auto_1fr] md:items-center">
            <BeaconMark className="size-24 text-accent-strong drop-shadow-[0_0_24px_var(--mk-lamp)] md:size-32" />
            <div className="max-w-xl">
              <p className="font-mono text-mono-sm text-fg-tertiary">404</p>
              <h1 className="mk-display mt-2 text-fg">Nothing at this address.</h1>
              <p className="mk-lede mt-4 text-fg-secondary">
                The link may be old, or the listing was archived. Your radar has everything that is
                still open.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild variant="primary" size="lg" className="gap-2">
                  <Link to="/radar">
                    <Radar className="size-4" strokeWidth={1.75} aria-hidden="true" /> Go to Radar
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="lg" className="gap-2">
                  <Link to="/">
                    <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden="true" /> Home
                  </Link>
                </Button>
              </div>
            </div>
          </Container>
        </Band>
      </main>
      <MarketingFooter />
    </div>
  );
}
