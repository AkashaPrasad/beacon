import { useQueryClient } from '@tanstack/react-query';
import { BellRing } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { queryKeys } from '@/api/keys';
import { usePushSubscription } from '@/api/push';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';
import { pushSoftAskDismissed, snoozePushSoftAsk } from '@/lib/push-soft-ask';
import type { AlertRule } from '@kestrel/shared';

/** USERFLOW §2: granting push creates "Fit ≥ 80, any type → Push, instantly" unless a push rule exists. */
async function ensureDefaultPushRule(): Promise<boolean> {
  const { items } = await api.get<{ items: AlertRule[] }>('/v1/alerts');
  if (items.some((rule) => rule.enabled && rule.channels.includes('push'))) return false;
  await api.post('/v1/alerts', {
    name: 'Strong fits, any type',
    enabled: true,
    conditions: { minFit: 80 },
    channels: ['push', 'inapp'],
    cadence: 'instant',
  });
  return true;
}

/**
 * Inline soft ask (copy #17). The browser prompt only opens from a click on [Turn on]
 * (USERFLOW §2: never on load). [Not now] hides it for 14 days.
 */
export function PushSoftAsk({ onDone, className }: { onDone?: () => void; className?: string }) {
  const push = usePushSubscription();
  const qc = useQueryClient();
  const [hidden, setHidden] = useState(() => pushSoftAskDismissed());
  if (hidden || push.isSubscribed || push.support === 'unsupported' || push.support === 'denied')
    return null;

  if (push.support === 'ios-needs-install') {
    return (
      <div className={className} data-testid="push-soft-ask">
        <p className="text-small text-fg-secondary">
          To get notifications on iPhone, add Beacon to your Home Screen (Share → Add to Home
          Screen).
        </p>
      </div>
    );
  }

  const dismiss = () => {
    snoozePushSoftAsk();
    setHidden(true);
    onDone?.();
  };

  const turnOn = async () => {
    try {
      await push.subscribe();
    } catch (error) {
      toast.error(errorMessage(error), { duration: 8000 });
      return;
    }
    try {
      await ensureDefaultPushRule();
      void qc.invalidateQueries({ queryKey: queryKeys.alerts });
    } catch {
      // The subscription worked; the rule can be created in Alerts.
    }
    toast.success('Push is on. Edit what triggers it in Alerts.');
    onDone?.();
  };

  return (
    <div className={className} data-testid="push-soft-ask">
      <div className="flex gap-3">
        <BellRing
          className="mt-0.5 size-4 shrink-0 text-fg-secondary"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <div className="flex flex-col gap-2">
          <p className="text-small text-fg">
            Get a push notification when a Strong fit opens? You can change this any time.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={push.isPending}
              onClick={() => void turnOn()}
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
