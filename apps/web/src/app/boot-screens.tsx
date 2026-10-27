import { Skeleton } from '@kestrel/ui';
import { CloudOff } from 'lucide-react';

import { BeaconMark } from '@/components/brand/BeaconMark';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api';

/** Shown while `/v1/me` resolves on a cold start: the shell's geometry, so nothing jumps. */
export function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg" aria-busy="true">
      <span className="sr-only" role="status">
        Loading Beacon
      </span>
      <div className="flex h-topbar items-center gap-3 border-b border-border-subtle px-gutter pt-safe">
        <BeaconMark className="size-6 text-fg" />
        <Skeleton className="hidden h-3 w-64 md:block" />
        <Skeleton className="ml-auto size-7 rounded-full" />
      </div>
      <div className="flex-1 bg-surface" />
    </div>
  );
}

export function FullPageError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-gutter" role="alert">
      <div className="flex max-w-prose flex-col items-center gap-3 text-center">
        <div className="grid size-10 place-items-center rounded-md bg-surface-sunken text-fg-secondary">
          <CloudOff className="size-5" strokeWidth={1.5} aria-hidden="true" />
        </div>
        <h1 className="font-display text-display text-fg">Couldn't reach Beacon.</h1>
        <p className="text-body-lg text-fg-secondary">{errorMessage(error)}</p>
        <Button variant="primary" size="lg" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </div>
  );
}
