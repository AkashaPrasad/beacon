import { BellOff, BellRing, CircleCheck, Info, Loader2, LocateFixed, Send, Smartphone } from 'lucide-react';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';

import { useAlerts, usePushSubscription, useUpdateSettings } from '@/api';
import { useSendTestNotification } from '@/api/settings';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { inputClass } from '@/features/settings/components/controls/styles';
import { ToggleChip } from '@/features/settings/components/controls/TokenChips';
import { SettingsRow, SettingsSection } from '@/features/settings/components/SettingsRow';
import {
  browserTimeZone,
  canonicalZone,
  formatMinutes,
  quietLength,
  timeZoneGroups,
  zoneLabel,
} from '@/features/settings/lib/timezones';
import { useSavedFlash } from '@/features/settings/lib/use-saved-flash';
import { errorMessage } from '@/lib/api';
import { DEADLINE_REMINDER_DAYS, type Settings, type SettingsPatch } from '@kestrel/shared';
import { cn } from '@kestrel/ui';

const UNBLOCK_HELP: { browser: string; steps: string }[] = [
  { browser: 'Chrome and Edge', steps: 'Click the icon left of the address, open Site settings, set Notifications to Allow, then reload.' },
  { browser: 'Safari (Mac)', steps: 'Safari › Settings › Websites › Notifications, find Beacon and choose Allow.' },
  { browser: 'Firefox', steps: 'Click the icon left of the address, clear the blocked Notifications permission, then reload.' },
  { browser: 'Android', steps: 'Tap the icon left of the address › Permissions › Notifications › Allow.' },
];

/** `<input type="time">` that saves on blur (not on every keystroke of the hour and minute fields). */
function TimeInput({
  value,
  onCommit,
  label,
  testId,
  describedBy,
}: {
  value: string;
  onCommit: (value: string) => void;
  label?: string;
  testId: string;
  describedBy?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  const commit = () => {
    if (/^\d{2}:\d{2}$/.test(draft) && draft !== value) onCommit(draft);
    else setDraft(value);
  };
  return (
    <input
      type="time"
      step={900}
      value={draft}
      aria-label={label}
      aria-describedby={describedBy}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
      }}
      data-testid={testId}
      className={cn(inputClass, 'w-32 font-mono text-mono')}
    />
  );
}

function PushRow({ settings, patch }: { settings: Settings; patch: (body: SettingsPatch, message?: string) => void }) {
  const push = usePushSubscription();
  const alerts = useAlerts();
  const sendTest = useSendTestNotification();
  const fallbackRule = useMemo(() => {
    const rules = alerts.data ?? [];
    return rules.find((r) => r.channels.includes('push'))?.id ?? rules[0]?.id ?? null;
  }, [alerts.data]);

  async function turnOn() {
    try {
      // The browser prompt opens only here, from this click (USERFLOW §2).
      await push.subscribe();
      patch({ notifications: { push: true } }, 'Push is on. Edit what triggers it in Alerts.');
    } catch (error) {
      toast.error(errorMessage(error, 'Couldn’t turn on push in this browser.'), { duration: 8000 });
    }
  }

  async function turnOff() {
    try {
      await push.unsubscribe();
      patch({ notifications: { push: false } }, 'Push is off for this browser.');
    } catch (error) {
      toast.error(errorMessage(error, 'Couldn’t turn off push. Try again.'), { duration: 8000 });
    }
  }

  let body: ReactNode;
  if (push.support === 'unsupported') {
    body = (
      <p className="flex items-start gap-2 text-small text-fg-secondary" data-testid="settings-push-state" data-state="unsupported">
        <BellOff className="mt-0.5 size-4 shrink-0 text-fg-tertiary" strokeWidth={1.5} aria-hidden="true" />
        This browser doesn’t support web push. In-app notifications still work.
      </p>
    );
  } else if (push.support === 'ios-needs-install') {
    body = (
      <p className="flex items-start gap-2 text-small text-fg-secondary" data-testid="settings-push-state" data-state="ios">
        <Smartphone className="mt-0.5 size-4 shrink-0 text-fg-tertiary" strokeWidth={1.5} aria-hidden="true" />
        To get notifications on iPhone, add Beacon to your Home Screen (Share → Add to Home Screen).
      </p>
    );
  } else if (push.support === 'denied') {
    body = (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="settings-push-state" data-state="denied">
        <p className="flex items-center gap-2 text-small text-fg-secondary">
          <BellOff className="size-4 shrink-0 text-warning" strokeWidth={1.5} aria-hidden="true" />
          Notifications are blocked in this browser.
        </p>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="link" size="sm" data-testid="settings-push-unblock">
              How to unblock
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-4">
            <h3 className="text-h3 text-fg">Allow notifications</h3>
            <dl className="mt-2 flex flex-col gap-2">
              {UNBLOCK_HELP.map((h) => (
                <div key={h.browser}>
                  <dt className="text-small font-medium text-fg">{h.browser}</dt>
                  <dd className="text-small text-fg-secondary">{h.steps}</dd>
                </div>
              ))}
            </dl>
          </PopoverContent>
        </Popover>
      </div>
    );
  } else if (push.isSubscribed) {
    body = (
      <div className="flex flex-wrap items-center gap-2" data-testid="settings-push-state" data-state="on">
        <p className="mr-1 flex items-center gap-1.5 text-body text-fg">
          <CircleCheck className="size-4 text-success" strokeWidth={1.5} aria-hidden="true" />
          On for this browser
        </p>
        <Button
          variant="secondary"
          size="sm"
          disabled={sendTest.isPending}
          onClick={() =>
            sendTest.mutate(fallbackRule, {
              onSuccess: () => toast('Test sent. It arrives in a few seconds.'),
              onError: (error) => toast.error(errorMessage(error, 'Couldn’t send a test.'), { duration: 8000 }),
            })
          }
          data-testid="settings-push-test"
        >
          {sendTest.isPending ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <Send className="size-4" strokeWidth={1.5} aria-hidden="true" />
          )}
          Send a test notification
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void turnOff()} disabled={push.isPending} data-testid="settings-push-disable">
          Turn off
        </Button>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col items-start gap-1.5" data-testid="settings-push-state" data-state="off">
        <Button
          variant="primary"
          onClick={() => void turnOn()}
          disabled={push.isPending}
          aria-busy={push.isPending || undefined}
          data-testid="settings-push-enable"
        >
          {push.isPending ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <BellRing className="size-4" strokeWidth={1.5} aria-hidden="true" />
          )}
          Turn on push
        </Button>
        <p className="text-caption text-fg-tertiary">
          {push.support === 'granted'
            ? 'Allowed before; this re-subscribes this browser.'
            : 'Your browser asks once. You can turn it off here any time.'}
          {settings.notifications.push && push.support !== 'granted' && ' Push is on for your other devices.'}
        </p>
      </div>
    );
  }

  return (
    <SettingsRow label="Web push" help="Strong fits and deadlines, even when Beacon is closed.">
      {() => body}
    </SettingsRow>
  );
}

function TimeZoneRow({ settings, patch }: { settings: Settings; patch: (body: SettingsPatch, message?: string) => void }) {
  const current = canonicalZone(settings.notifications.timezone);
  const device = browserTimeZone();
  const groups = useMemo(() => timeZoneGroups(current), [current]);
  const id = useId();
  return (
    <SettingsRow label="Time zone" help="Deadlines, quiet hours and the digest use it.">
      {({ labelId, helpId }) => (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <select
              id={id}
              aria-labelledby={labelId}
              aria-describedby={helpId}
              value={current}
              onChange={(e) => patch({ notifications: { timezone: e.target.value } })}
              data-testid="settings-timezone"
              className={cn(inputClass, 'w-auto max-w-full min-w-56 appearance-auto')}
            >
              {groups.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {device !== current && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => patch({ notifications: { timezone: device } }, `Time zone set to ${zoneLabel(device)}.`)}
                data-testid="settings-timezone-detect"
              >
                <LocateFixed className="size-4" strokeWidth={1.5} aria-hidden="true" />
                Use this device’s ({zoneLabel(device).split(' · ')[0]})
              </Button>
            )}
          </div>
          {device !== current && (
            <p className="text-caption text-fg-tertiary">This device is set to {zoneLabel(device)}.</p>
          )}
        </div>
      )}
    </SettingsRow>
  );
}

/**
 * Settings > Notifications (DESIGN §10.6, USERFLOW §2–§3.4): web push (asks the browser only from the
 * [Turn on push] click), in-app, deadline reminders, tracker nudges, quiet hours, digest time and the
 * time zone. Every change saves on change. No email or Telegram (BRIEF #1).
 */
export function NotificationsTab({ settings }: { settings: Settings }) {
  const update = useUpdateSettings();
  const [saved, flash] = useSavedFlash();
  const n = settings.notifications;
  const quiet = n.quietHours;

  function patch(body: SettingsPatch, message?: string) {
    update.mutate(body, {
      onSuccess: () => {
        flash();
        if (message) toast(message);
      },
      onError: (error) => toast.error(errorMessage(error, 'Couldn’t save that. Try again.'), { duration: 8000 }),
    });
  }

  return (
    <SettingsSection
      title="Notifications"
      description="Web push and Beacon’s own notification centre. Nothing goes to your email."
      saved={saved}
      data-testid="settings-notifications"
    >
      <PushRow settings={settings} patch={patch} />

      <SettingsRow label="In Beacon" help="The bell and the notification centre.">
        {({ labelId, helpId }) => (
          <Switch
            checked={n.inapp}
            onCheckedChange={(inapp) => patch({ notifications: { inapp } })}
            aria-labelledby={labelId}
            aria-describedby={helpId}
            data-testid="settings-inapp"
          />
        )}
      </SettingsRow>

      <SettingsRow label="Deadline reminders" help="For saved and tracked listings. Push (if on) and in Beacon.">
        {({ labelId }) => (
          <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-1.5" data-testid="settings-reminders">
            {DEADLINE_REMINDER_DAYS.map((days) => {
              const on = n.deadlineReminders.includes(days);
              return (
                <ToggleChip
                  key={days}
                  label={days === 1 ? '1 day before' : `${days} days before`}
                  pressed={on}
                  data-testid="settings-reminder-chip"
                  onPressedChange={(next) => {
                    const set = new Set(n.deadlineReminders);
                    if (next) set.add(days);
                    else set.delete(days);
                    patch({ notifications: { deadlineReminders: [...set].sort((a, b) => b - a) } });
                  }}
                />
              );
            })}
          </div>
        )}
      </SettingsRow>

      <SettingsRow label="Tracker nudges by push" help="Follow-up and “move on” reminders. Off by default; they always show in Beacon.">
        {({ labelId, helpId }) => (
          <Switch
            checked={n.nudges}
            onCheckedChange={(nudges) => patch({ notifications: { nudges } })}
            aria-labelledby={labelId}
            aria-describedby={helpId}
            data-testid="settings-nudges"
          />
        )}
      </SettingsRow>

      <SettingsRow label="Quiet hours" help="Pushes wait until they end. Deadline reminders move to the end of the window.">
        {({ labelId, helpId }) => (
          <div className="flex flex-col gap-3">
            <Switch
              checked={Boolean(quiet)}
              onCheckedChange={(on) =>
                patch({ notifications: { quietHours: on ? (quiet ?? { start: '22:00', end: '07:00' }) : null } })
              }
              aria-labelledby={labelId}
              aria-describedby={helpId}
              data-testid="settings-quiet"
            />
            {quiet && (
              <div className="flex flex-wrap items-center gap-2 text-small text-fg-secondary">
                <span>From</span>
                <TimeInput
                  value={quiet.start}
                  label="Quiet hours start"
                  testId="settings-quiet-start"
                  onCommit={(start) => patch({ notifications: { quietHours: { ...quiet, start } } })}
                />
                <span>to</span>
                <TimeInput
                  value={quiet.end}
                  label="Quiet hours end"
                  testId="settings-quiet-end"
                  onCommit={(end) => patch({ notifications: { quietHours: { ...quiet, end } } })}
                />
                <span className="font-mono text-mono-sm text-fg-tertiary">{formatMinutes(quietLength(quiet.start, quiet.end))}</span>
              </div>
            )}
          </div>
        )}
      </SettingsRow>

      <SettingsRow label="Daily digest" help="An in-Beacon summary of new Strong fits and deadlines.">
        {({ helpId }) => (
          <TimeInput
            value={n.digestTime}
            label="Daily digest time"
            describedBy={helpId}
            testId="settings-digest-time"
            onCommit={(digestTime) => patch({ notifications: { digestTime } })}
          />
        )}
      </SettingsRow>

      <TimeZoneRow settings={settings} patch={patch} />

      <p className="mt-4 flex items-start gap-2 text-small text-fg-tertiary">
        <Info className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        <span>
          What triggers a push is set per rule in{' '}
          <Link to="/alerts" className="rounded-xs font-medium text-accent-strong underline-offset-3 hover:underline focus-visible:focus-ring">
            Alerts
          </Link>
          . At most 10 pushes a day; the rest wait in Beacon.
        </span>
      </p>
    </SettingsSection>
  );
}
