import { variants } from '@kestrel/ui';
import { WifiOff } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';

import { useIsOffline } from '@/lib/connectivity';

/** Top strip with copy #22 while offline (navigator.onLine or a failed /healthz probe). */
export function OfflineBanner() {
  const offline = useIsOffline();
  return (
    <div aria-live="polite" className="contents">
      <AnimatePresence initial={false}>
        {offline && (
          <m.div
            data-testid="offline-banner"
            role="status"
            variants={variants.fade}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex h-8 items-center justify-center gap-2 bg-warning-subtle px-gutter text-small text-warning"
          >
            <WifiOff className="size-4" strokeWidth={1.5} aria-hidden="true" />
            You're offline. Changes will sync when you're back.
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
