/**
 * How alerts reach you, condensed to one quiet line ("Push on in this browser · Reminders 7, 3 and 1
 * days before · Quiet hours off"). The details open on demand: web push for this browser, deadline
 * reminders, quiet hours and tracker-nudge pushes, saved on change (USERFLOW §2, §3.3).
 */
import type { Settings, SettingsPatch } from '@kestrel/shared';
import { Skeleton, tweens } from '@kestrel/ui';
import { BellRing, ChevronDown, ChevronRight, CircleCheck, Moon, Timer } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';

import { getPushSupport, usePushSubscription } from '@/api/push';
import { useSettings, useUpdateSettings } from '@/api/settings';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

import {
  REMINDER_STEPS,
  parseReminderValues,
  pushStatus,
  quietHoursSummary,
  remindersSummary,
  unblockHelp,
  type PushStatus,
} from '../lib/delivery';
import { envFromSupport } from '../lib/push-ask';

/** "Saved" caption that fades after 1.5 s (DESIGN §6.1 Settings). */
function useSavedFlash() {
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (!at) return undefined;
    const t = setTimeout(() => setAt(0), 1500);
    return () => clearTimeout(t);
  }, [at]);
  return { saved: at > 0, flash: () => setAt(Date.now()) };
}

function Row({ icon: Icon, title, aside, children }: { icon: typeof BellRing; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-fg-tertiary" strokeWidth={1.5} aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-h-6 items-center gap-2">
          <h3 className="flex-1 text-small font-medium text-fg">{title}</h3>
          {aside}
        </div>
        {children}
      </div>
    </div>
  );
}

const PUSH_SHORT: Record<PushStatus['kind'], string> = {
  on: 'Push on in this browser',
  'not-set-up': 'Push not set up here',
  off: 'Push off in this browser',
  blocked: 'Push blocked in this browser',
  'ios-install': 'Push needs the Home Screen app',
  unsupported: 'In-app alerts only here',
};

export function DeliverySummary({ className }: { className?: string }) {
  const settings = useSettings();
  const updateSettings = useUpdateSettings();
  const { saved, flash } = useSavedFlash();
  const push = usePushSubscription();
  const [support, setSupport] = useState(() => getPushSupport());
  const status = pushStatus(envFromSupport(support), push.isSubscribed);

  const n: Settings['notifications'] | undefined = settings.data?.notifications;
  const quiet = n ? quietHoursSummary(n.quietHours, n.timezone) : null;

  const save = (patch: NonNullable<SettingsPatch['notifications']>) =>
    updateSettings.mutate(
      { notifications: patch },
      {
        onSuccess: flash,
        onError: (e) => toast.error(`Couldn't save that. ${errorMessage(e)}`, { duration: 8000 }),
      },
    );

  const turnOn = () => {
    push
      .subscribe()
      .then(() => {
        setSupport(getPushSupport());
        toast.success('Push is on in this browser.');
      })
      .catch((error: unknown) => {
        const now = getPushSupport();
        setSupport(now);
        if (now !== 'denied') toast.error(`Couldn't turn on push. ${errorMessage(error)}`, { duration: 8000 });
      });
  };

  const parts = [
    PUSH_SHORT[status.kind],
    n ? `Reminders ${remindersSummary(n.deadlineReminders).replace(/^Off$/, 'off')}` : null,
    n ? (quiet ? `Quiet hours ${quiet}` : 'Quiet hours off') : null,
  ].filter(Boolean);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="alerts-delivery"
          className={cn(
            'group/summary flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-small text-fg-secondary',
            'transition-colors duration-fast hover:bg-surface-hover hover:text-fg focus-visible:focus-ring data-[state=open]:bg-surface-hover',
            className,
          )}
        >
          <BellRing className="size-4 shrink-0 text-fg-tertiary" strokeWidth={1.5} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            {parts.length > 1 ? parts.join(' · ') : <Skeleton className="inline-block h-3 w-56 align-middle" />}
          </span>
          <span className="shrink-0 text-accent-strong">Delivery settings</span>
          <ChevronDown
            className="size-4 shrink-0 text-fg-tertiary transition-transform duration-fast group-data-[state=open]/summary:rotate-180"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label="Delivery settings"
        data-testid="alerts-delivery-panel"
        className="w-[22rem] max-w-[calc(100vw-2rem)] px-4 py-1"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border-subtle py-3">
          <h2 className="text-h3 text-fg">How alerts reach you</h2>
          <AnimatePresence initial={false}>
            {saved ? (
              <m.span
                key="saved"
                role="status"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: tweens.fadeIn }}
                exit={{ opacity: 0, transition: tweens.exit }}
                className="inline-flex items-center gap-1 text-caption text-success"
              >
                <CircleCheck className="size-3.5" strokeWidth={1.5} aria-hidden="true" /> Saved
              </m.span>
            ) : null}
          </AnimatePresence>
        </div>

        <div className="divide-y divide-border-subtle">
          <Row
            icon={BellRing}
            title="Web push"
            aside={
              status.canTurnOn ? (
                <Button size="sm" variant="secondary" onClick={turnOn} disabled={push.isPending}>
                  Turn on
                </Button>
              ) : null
            }
          >
            <p className="text-small text-fg-secondary" data-testid="alerts-push-status" data-status={status.kind}>
              <span className={cn('font-medium', status.kind === 'on' ? 'text-success' : 'text-fg')}>{status.label}.</span>{' '}
              {status.detail}
            </p>
            {status.kind === 'blocked' ? (
              <p className="text-caption text-fg-tertiary">
                {unblockHelp(typeof navigator === 'undefined' ? '' : navigator.userAgent)}
              </p>
            ) : null}
          </Row>

          <Row icon={Timer} title="Deadline reminders">
            {n ? (
              <>
                <ToggleGroup
                  type="multiple"
                  value={n.deadlineReminders.map(String)}
                  onValueChange={(values) => save({ deadlineReminders: parseReminderValues(values) })}
                  aria-label="Deadline reminders"
                  className="flex-wrap"
                  data-testid="alerts-reminders"
                >
                  {REMINDER_STEPS.map((d) => (
                    <ToggleGroupItem
                      key={d}
                      value={String(d)}
                      variant="outline"
                      size="sm"
                      className="font-mono data-[state=on]:border-accent-strong/40"
                    >
                      <span aria-hidden="true">{d}d</span>
                      <span className="sr-only">{`${d} ${d === 1 ? 'day' : 'days'} before`}</span>
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <p className="text-caption text-fg-tertiary">
                  {n.deadlineReminders.length
                    ? `${remindersSummary(n.deadlineReminders)} a deadline, for listings you’ve saved or tracked.`
                    : 'Off. Pick a day to be reminded before deadlines.'}
                </p>
              </>
            ) : (
              <Skeleton className="h-7 w-40" />
            )}
          </Row>

          <Row icon={Moon} title="Quiet hours">
            <p className="text-small text-fg-secondary" data-testid="alerts-quiet-hours">
              {quiet ? (
                <>
                  <span className="font-mono text-mono-sm text-fg">{quiet}</span>. Pushes wait until they end, and
                  deadline reminders move to the end of them.
                </>
              ) : (
                'Off. Pushes can arrive at any hour.'
              )}
            </p>
          </Row>

          <Row
            icon={BellRing}
            title="Tracker nudges by push"
            aside={
              n ? <Switch checked={n.nudges} onCheckedChange={(nudges) => save({ nudges })} aria-label="Tracker nudges by push" /> : null
            }
          >
            <p className="text-caption text-fg-tertiary">Gentle follow-up reminders. At most one push a day.</p>
          </Row>
        </div>

        <div className="border-t border-border-subtle py-3">
          <Link
            to="/settings/notifications"
            className="inline-flex items-center gap-1 rounded-xs text-small text-accent-strong underline-offset-3 hover:underline focus-visible:focus-ring"
          >
            All notification settings
            <ChevronRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
