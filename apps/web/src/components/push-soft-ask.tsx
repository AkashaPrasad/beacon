import { BellRing } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { usePushSubscription } from '@/api/push';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api';
import { readJson, STORAGE_KEYS, writeJson } from '@/lib/storage';

const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

export function pushSoftAskDismissed(): boolean {
  const until = readJson<number>(STORAGE_KEYS.pushSoftAsk, 0);
  return until > Date.now();
}

/**
 * Inline soft ask (copy #17). The browser prompt only opens from a click on [Turn on]
 * (USERFLOW §2: never on load). [Not now] hides it for 14 days.
 */
export function PushSoftAsk({ onDone, className }: { onDone?: () => void; className?: string }) {
  const push = usePushSubscription();
  const [hidden, setHidden] = useState(pushSoftAskDismissed);
  if (hidden || push.isSubscribed || push.support === 'unsupported' || push.support === 'denied') return null;

  if (push.support === 'ios-needs-install') {
    return (
      <div className={className}>
        <p className="text-small text-fg-secondary">
          To get notifications on iPhone, add Beacon to your Home Screen (Share → Add to Home Screen).
        </p>
      </div>
    );
  }

  const dismiss = () => {
    writeJson(STORAGE_KEYS.pushSoftAsk, Date.now() + SNOOZE_MS);
    setHidden(true);
    onDone?.();
  };

  return (
    <div className={className} data-testid="push-soft-ask">
      <div className="flex gap-3">
        <BellRing className="mt-0.5 size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} aria-hidden="true" />
        <div className="flex flex-col gap-2">
          <p className="text-small text-fg">
            Get a push notification when a Strong fit opens? You can change this any time.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={push.isPending}
              onClick={() => {
                push
                  .subscribe()
                  .then(() => {
                    toast.success('Push is on. Edit what triggers it in Alerts.');
                    onDone?.();
                  })
                  .catch((error: unknown) => toast.error(errorMessage(error), { duration: 8000 }));
              }}
            >
              Turn on
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss}>
              Not now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
