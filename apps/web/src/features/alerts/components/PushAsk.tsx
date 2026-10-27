/**
 * Push permission inside the rule builder (USERFLOW §2 "First alert rule with Push"): a soft ask that
 * only ever calls the browser prompt from a click on [Allow notifications]. Never on load.
 */
import { BellOff, BellRing, CircleCheck, Share } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { tweens, variants } from '@kestrel/ui';

import type { SoftAskMode } from '../lib/push-ask';

export type PushAskState = SoftAskMode | 'declined' | 'enabled';

function Card({ children, testId, tone = 'neutral' }: { children: ReactNode; testId: string; tone?: 'neutral' | 'muted' }) {
  return (
    <m.div
      key={testId}
      data-testid={testId}
      variants={variants.fade}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={
        tone === 'neutral'
          ? 'flex gap-3 rounded-md border border-border bg-surface-raised p-3'
          : 'flex gap-2 text-small text-fg-secondary'
      }
    >
      {children}
    </m.div>
  );
}

export function PushAsk({
  state,
  pending,
  onAllow,
  onDecline,
}: {
  state: PushAskState;
  pending: boolean;
  onAllow: () => void;
  onDecline: () => void;
}) {
  return (
    <div aria-live="polite" className="empty:hidden">
      <AnimatePresence initial={false} mode="wait">
        {state === 'ask' ? (
          <Card testId="push-soft-ask">
            <BellRing className="mt-0.5 size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} aria-hidden="true" />
            <div className="flex flex-col gap-2">
              <p className="text-small text-fg">
                <span className="font-medium">Push needs permission in this browser.</span> Get a notification the
                moment a match opens. You can change this any time.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={onAllow} disabled={pending} data-testid="alerts-push-allow">
                  <BellRing strokeWidth={1.5} /> Allow notifications
                </Button>
                <Button size="sm" variant="ghost" onClick={onDecline} disabled={pending}>
                  Not now
                </Button>
              </div>
            </div>
          </Card>
        ) : state === 'ios-install' ? (
          <Card testId="alerts-ios-install">
            <Share className="mt-0.5 size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} aria-hidden="true" />
            <p className="text-small text-fg">
              To get notifications on iPhone, add Beacon to your Home Screen (Share → Add to Home Screen). In-app
              alerts work now.
            </p>
          </Card>
        ) : state === 'declined' ? (
          <Card testId="alerts-push-declined" tone="muted">
            <BellOff className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            <span>Push is off for this rule.</span>
          </Card>
        ) : state === 'blocked' ? (
          <Card testId="alerts-push-blocked" tone="muted">
            <BellOff className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            <span>
              Notifications are blocked in this browser, so this device gets in-app alerts only. Change it in{' '}
              <Link
                to="/settings/notifications"
                className="rounded-xs text-accent-strong underline-offset-3 hover:underline focus-visible:focus-ring"
              >
                Settings
              </Link>
              .
            </span>
          </Card>
        ) : state === 'unsupported' ? (
          <Card testId="alerts-push-unsupported" tone="muted">
            <BellOff className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            <span>This browser can’t show push notifications. In-app alerts still work.</span>
          </Card>
        ) : state === 'enabled' ? (
          <m.p
            key="enabled"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: tweens.fadeIn }}
            exit={{ opacity: 0, transition: tweens.exit }}
            className="flex items-center gap-2 text-small text-success"
          >
            <CircleCheck className="size-4" strokeWidth={1.5} aria-hidden="true" />
            Push is on in this browser.
          </m.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
