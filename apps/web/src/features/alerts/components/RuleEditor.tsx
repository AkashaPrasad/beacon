/**
 * Alert rule editor page (/alerts/new, /alerts/:id). The sentence comes first; what it means in plain
 * words sits right under it; the name and the rule's quiet hours are one step away in "More options";
 * digest time and day live in the frequency bracket. Save returns to /alerts.
 */
import type { AlertRuleInput } from '@kestrel/shared';
import { Shortcut, springs, tweens } from '@kestrel/ui';
import { ChevronDown, ChevronLeft, CircleAlert, Copy, MoreHorizontal, Send, Trash2 } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';

import { nextAlertTempKey, useAlertPreview, useCreateAlert, useUpdateAlert, type AlertRuleDTO } from '@/api/alerts';
import { getPushSupport, usePushSubscription, type PushSupport } from '@/api/push';
import { useSettings } from '@/api/settings';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Ticker } from '@/features/sources/components/common/Ticker';
import { errorMessage } from '@/lib/api';
import { useShortcut, useShortcutScope } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';

import { duplicateName, inputToPatch, quietHoursSummary, zoneLabel } from '../lib/delivery';
import { markJustSaved } from '../lib/just-saved';
import { envFromSupport, softAskMode } from '../lib/push-ask';
import {
  draftToInput,
  previewSentence,
  suggestName,
  type DraftErrors,
  type DraftField,
  type RuleDraft,
} from '../lib/rule-draft';
import { useDebouncedValue } from '../lib/use-debounced';
import { useRuleActions } from '../lib/use-rule-actions';
import { PushAsk, type PushAskState } from './PushAsk';
import { SentenceBuilder, type TokenId } from './SentenceBuilder';

/** Field order for focusing the first invalid control on save. */
const FIELD_ORDER: DraftField[] = [
  'minFit',
  'types',
  'deadlineDays',
  'locations',
  'keywords',
  'channels',
  'cadence',
  'digestTime',
  'name',
  'quietHours',
];

const FIELD_SELECTOR: Partial<Record<DraftField, string>> = {
  minFit: '[data-token="fit"]',
  types: '[data-token="type"]',
  deadlineDays: '[data-token="deadline"]',
  locations: '[data-token="location"]',
  keywords: '[data-token="keywords"]',
  channels: '[data-testid="alerts-channel-push"]',
  cadence: '[data-token="cadence"]',
  digestTime: '[data-token="cadence"]',
  name: '[data-testid="alerts-name"]',
  quietHours: '[data-testid="alerts-quiet-start"]',
};

const MORE_FIELDS: ReadonlySet<DraftField> = new Set(['name', 'quietHours']);

/** Whether this browser already holds a push subscription (checked once, without prompting). */
function useHasPushSubscription(support: PushSupport): boolean | null {
  const [has, setHas] = useState<boolean | null>(null);
  useEffect(() => {
    if (support !== 'granted' || !('serviceWorker' in navigator)) return undefined;
    let cancelled = false;
    const done = (value: boolean) => {
      if (!cancelled) setHas(value);
    };
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription() ?? null)
      .then((sub) => done(Boolean(sub)))
      .catch(() => done(false));
    return () => {
      cancelled = true;
    };
  }, [support]);
  return support === 'granted' ? has : false;
}

export function RuleEditor({ rule, initialDraft }: { rule: AlertRuleDTO | null; initialDraft: RuleDraft }) {
  const mode = rule ? 'edit' : 'create';
  const baseId = useId();
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const settings = useSettings();
  const createAlert = useCreateAlert();
  const updateAlert = useUpdateAlert();
  const ruleActions = useRuleActions();

  const [draft, setDraft] = useState<RuleDraft>(initialDraft);
  const [openToken, setOpenToken] = useState<TokenId | null>(null);
  const [touched, setTouched] = useState<ReadonlySet<DraftField>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const timezone = settings.data?.notifications.timezone ?? 'Asia/Kolkata';
  const zone = zoneLabel(timezone);
  const accountQuiet = settings.data ? quietHoursSummary(settings.data.notifications.quietHours, timezone) : null;

  // Push soft ask (USERFLOW §2): the browser prompt only opens from [Allow notifications].
  const push = usePushSubscription();
  const [support, setSupport] = useState<PushSupport>(() => getPushSupport());
  const hasSubscription = useHasPushSubscription(support);
  const [declined, setDeclined] = useState(false);
  const [justEnabled, setJustEnabled] = useState(false);

  const result = useMemo(() => draftToInput(draft, { timezone }), [draft, timezone]);
  const errors: DraftErrors = useMemo(() => {
    if (submitted) return result.errors;
    const shown: DraftErrors = {};
    for (const [field, message] of Object.entries(result.errors) as [DraftField, string][]) {
      if (touched.has(field)) shown[field] = message;
    }
    return shown;
  }, [result.errors, submitted, touched]);
  const errorId = (field: DraftField) => `${baseId}-error-${field}`;
  const errorList = FIELD_ORDER.filter((f) => errors[f]).map((f) => ({ field: f, message: errors[f] ?? '' }));
  const touch = (field: DraftField) => setTouched((prev) => (prev.has(field) ? prev : new Set([...prev, field])));
  const update = (fn: (d: RuleDraft) => RuleDraft) => setDraft(fn);

  const pushOn = draft.channels.includes('push');
  let askMode = softAskMode(envFromSupport(support), pushOn);
  if (askMode === 'none' && pushOn && support === 'granted' && hasSubscription === false) askMode = 'ask';
  // "Not now" sticks only while Push stays off; turning it back on asks again.
  const pushState: PushAskState = declined && !pushOn ? 'declined' : justEnabled && pushOn ? 'enabled' : askMode;

  const allow = () => {
    push
      .subscribe()
      .then(() => {
        setSupport(getPushSupport());
        setJustEnabled(true);
      })
      .catch((error: unknown) => {
        const now = getPushSupport();
        setSupport(now);
        if (now !== 'denied') toast.error(`Couldn't turn on push. ${errorMessage(error)}`, { duration: 8000 });
      });
  };
  const decline = () => {
    setDeclined(true);
    setDraft((d) => ({ ...d, channels: ['inapp'] }));
  };

  // Live "would have matched" count: debounced, only for a valid sentence; hidden without a preview API.
  const conditions = useDebouncedValue(result.ok ? result.value.conditions : null, 400);
  const preview = useAlertPreview(conditions ?? null);
  const count = preview.data?.matchesLast7d;

  const nameValue = draft.nameTouched ? draft.name : suggestName(draft);
  const back = () => void navigate('/alerts');

  const save = () => {
    if (!result.ok) {
      setSubmitted(true);
      setOpenToken(null);
      const first = FIELD_ORDER.find((f) => result.errors[f]);
      if (first && MORE_FIELDS.has(first)) setMoreOpen(true);
      requestAnimationFrame(() => {
        if (first) formRef.current?.querySelector<HTMLElement>(FIELD_SELECTOR[first] ?? '')?.focus();
      });
      return;
    }
    const value: AlertRuleInput = result.value;
    if (rule) {
      updateAlert.mutate(
        { id: rule.id, patch: inputToPatch(value) },
        {
          onSuccess: () => toast.success('Changes saved.'),
          onError: (e) => toast.error(`Couldn't save your changes. ${errorMessage(e)}`, { duration: 8000 }),
        },
      );
    } else {
      markJustSaved(nextAlertTempKey());
      createAlert.mutate(value, {
        onSuccess: () => toast.success("Saved. We'll let you know when something matches."),
        onError: (e) =>
          toast.error(`Couldn't save the rule. ${errorMessage(e)}`, {
            duration: 8000,
            action: { label: 'Edit again', onClick: () => void navigate('/alerts/new', { state: { draft } }) },
          }),
      });
    }
    back();
  };

  useShortcutScope('alerts-editor');
  useShortcut('mod+enter', save, { scope: 'alerts-editor', description: 'Save alert rule', group: 'Alerts', allowInInput: true });
  useShortcut('escape', back, { scope: 'alerts-editor', description: 'Back to Alerts', group: 'Alerts', allowInInput: false });

  const quietCustom = draft.quietHours !== null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-gutter">
      <div className="pt-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="ghost" size="sm" className="-ml-2.5">
              <Link to="/alerts" data-testid="alerts-back">
                <ChevronLeft strokeWidth={1.5} /> Alerts
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent className="flex items-center gap-2">
            Back <Shortcut keys="escape" />
          </TooltipContent>
        </Tooltip>
      </div>

      <header className="flex flex-wrap items-start gap-x-4 gap-y-3 pt-2 pb-6">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-h1 text-balance text-fg">{rule ? nameValue : 'New alert'}</h1>
          <p className="mt-1 text-body text-fg-secondary">
            {rule
              ? 'Changes apply to new listings from now on.'
              : 'Say what’s worth hearing about. Each highlighted part opens its options.'}
          </p>
        </div>
        {rule ? (
          <div className="flex items-center gap-1">
            <Button
              variant="secondary"
              size="sm"
              data-testid="alerts-test"
              onClick={() => ruleActions.test(rule)}
              disabled={ruleActions.testingId === rule.id}
            >
              <Send strokeWidth={1.5} /> {ruleActions.testingId === rule.id ? 'Sending…' : 'Send test'}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`More for ${rule.name}`}>
                  <MoreHorizontal strokeWidth={1.5} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onSelect={() =>
                    void navigate('/alerts/new', {
                      state: { draft: { ...draft, name: duplicateName(nameValue), nameTouched: true } },
                    })
                  }
                >
                  <Copy strokeWidth={1.5} /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="danger"
                  onSelect={() => {
                    ruleActions.remove(rule);
                    back();
                  }}
                >
                  <Trash2 strokeWidth={1.5} /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </header>

      <form
        ref={formRef}
        noValidate
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <section aria-label="Rule" className="rounded-lg border border-border bg-surface-raised p-5 sm:p-6">
          <SentenceBuilder
            draft={draft}
            update={update}
            errors={errors}
            errorId={errorId}
            openToken={openToken}
            setOpenToken={setOpenToken}
            onTouch={touch}
            zone={zone}
          />
        </section>

        <section aria-labelledby={`${baseId}-preview`} className="flex flex-col gap-1.5">
          <h2 id={`${baseId}-preview`} className="text-label text-fg-tertiary uppercase">
            What you’ll get
          </h2>
          <p data-testid="alerts-plain-preview" aria-live="polite" className="text-body-lg text-pretty text-fg">
            {previewSentence(draft, zone)}
          </p>
          <div aria-live="polite" className="min-h-5 text-small text-fg-secondary" data-testid="alerts-preview">
            <AnimatePresence initial={false} mode="wait">
              {result.ok && count != null ? (
                <m.p
                  key="count"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: tweens.fadeIn }}
                  exit={{ opacity: 0, transition: tweens.exit }}
                >
                  {count === 0 ? (
                    'Nothing in the last 7 days would have matched. Loosen a condition to hear more.'
                  ) : (
                    <>
                      In the last 7 days, that’s <Ticker value={count} className="text-fg" />{' '}
                      {count === 1 ? 'listing' : 'listings'}.
                    </>
                  )}
                </m.p>
              ) : null}
            </AnimatePresence>
          </div>
        </section>

        <PushAsk state={pushState} pending={push.isPending} onAllow={allow} onDecline={decline} />

        {errorList.length > 0 ? (
          <ul className="flex flex-col gap-1" role={submitted ? 'alert' : undefined} aria-live="polite">
            {errorList.map(({ field, message }) => (
              <li key={field} id={errorId(field)} className="flex items-start gap-2 text-small text-danger">
                <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                {message}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-col">
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-controls={`${baseId}-more`}
            onClick={() => setMoreOpen((o) => !o)}
            data-testid="alerts-more-options"
            className="-mx-2 inline-flex items-center gap-1.5 self-start rounded-sm px-2 py-1.5 text-small text-fg-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-fg focus-visible:focus-ring"
          >
            <ChevronDown
              className={cn('size-4 transition-transform duration-fast', !moreOpen && '-rotate-90')}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            More options
            <span className="text-fg-tertiary">· name, quiet hours</span>
          </button>
          <AnimatePresence initial={false}>
            {moreOpen ? (
              <m.div
                key="more"
                id={`${baseId}-more`}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0, transition: springs.smooth }}
                exit={{ opacity: 0, transition: tweens.exit }}
                className="mt-3 flex flex-col gap-6 rounded-lg border border-border-subtle p-5"
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${baseId}-name`}>Name</Label>
                  <Input
                    id={`${baseId}-name`}
                    data-testid="alerts-name"
                    value={nameValue}
                    maxLength={80}
                    onChange={(e) => {
                      const name = e.target.value;
                      update((d) => ({ ...d, name, nameTouched: true }));
                    }}
                    onBlur={() => touch('name')}
                    aria-invalid={errors.name ? true : undefined}
                    aria-describedby={errors.name ? errorId('name') : `${baseId}-name-hint`}
                    className={cn(!draft.nameTouched && 'text-fg-secondary')}
                  />
                  {!errors.name ? (
                    <p id={`${baseId}-name-hint`} className="text-caption text-fg-tertiary">
                      {draft.nameTouched && draft.name !== suggestName(draft) ? (
                        <button
                          type="button"
                          className="rounded-xs text-accent-strong underline-offset-3 hover:underline focus-visible:focus-ring"
                          onClick={() => update((d) => ({ ...d, name: '', nameTouched: false }))}
                        >
                          Use “{suggestName(draft)}”
                        </button>
                      ) : (
                        'Follows the rule until you edit it.'
                      )}
                    </p>
                  ) : null}
                </div>

                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 text-small font-medium text-fg">Quiet hours for this rule</legend>
                  <RadioGroup
                    value={quietCustom ? 'custom' : 'account'}
                    onValueChange={(v) =>
                      update((d) => ({
                        ...d,
                        quietHours: v === 'custom' ? (d.quietHours ?? { start: '22:00', end: '07:00' }) : null,
                      }))
                    }
                    className="gap-2"
                  >
                    <label className="flex items-start gap-3 text-small text-fg">
                      <RadioGroupItem value="account" className="mt-0.5" />
                      <span>
                        Same as my quiet hours{' '}
                        <span className="text-fg-tertiary">({accountQuiet ?? 'off'})</span>
                      </span>
                    </label>
                    <label className="flex items-start gap-3 text-small text-fg">
                      <RadioGroupItem value="custom" className="mt-0.5" />
                      <span>Different hours for this rule</span>
                    </label>
                  </RadioGroup>
                  {draft.quietHours ? (
                    <div className="flex flex-wrap items-end gap-3 pl-7">
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`${baseId}-quiet-start`} className="text-small text-fg-secondary">
                          From ({zone})
                        </Label>
                        <Input
                          id={`${baseId}-quiet-start`}
                          data-testid="alerts-quiet-start"
                          type="time"
                          step={900}
                          value={draft.quietHours.start}
                          onChange={(e) =>
                            update((d) => ({ ...d, quietHours: { start: e.target.value, end: d.quietHours?.end ?? '07:00' } }))
                          }
                          aria-invalid={errors.quietHours ? true : undefined}
                          aria-describedby={errors.quietHours ? errorId('quietHours') : undefined}
                          className="h-control-sm w-28 font-mono"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`${baseId}-quiet-end`} className="text-small text-fg-secondary">
                          To
                        </Label>
                        <Input
                          id={`${baseId}-quiet-end`}
                          type="time"
                          step={900}
                          value={draft.quietHours.end}
                          onChange={(e) =>
                            update((d) => ({ ...d, quietHours: { start: d.quietHours?.start ?? '22:00', end: e.target.value } }))
                          }
                          aria-invalid={errors.quietHours ? true : undefined}
                          className="h-control-sm w-28 font-mono"
                        />
                      </div>
                    </div>
                  ) : null}
                  <p className="text-caption text-fg-tertiary">
                    Pushes from this rule wait until quiet hours end. In-app alerts still arrive.
                  </p>
                </fieldset>
              </m.div>
            ) : null}
          </AnimatePresence>
        </div>

        <m.footer
          layout="position"
          transition={{ layout: springs.gentle }}
          className="sticky bottom-[calc(var(--tabbar-h)+var(--safe-bottom))] z-sticky -mx-gutter flex items-center justify-end gap-2 border-t border-border-subtle bg-surface px-gutter py-3 md:bottom-0"
        >
          <Button type="button" variant="ghost" onClick={back}>
            Cancel
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="submit" variant="primary" data-testid="alerts-save" aria-keyshortcuts="Meta+Enter Control+Enter">
                {rule ? 'Save changes' : 'Save alert'}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-2">
              Save <Shortcut keys="mod+enter" />
            </TooltipContent>
          </Tooltip>
        </m.footer>
      </form>
    </div>
  );
}
