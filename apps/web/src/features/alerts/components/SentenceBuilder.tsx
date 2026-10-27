/**
 * The rule as a sentence (DESIGN §6.1): every bracket is a token that opens its control in a popover,
 * `+ condition` appends "and …", × removes it, and the words reflow with a shared layout spring.
 *
 *   When [fit ≥ 80] and [type is Internship] and [deadline ≤ 14 days] [+ condition]
 *   → notify me by [Push] [In-app] [instantly]
 */
import { ArrowRight, BellRing, Check, ChevronDown, Inbox, Plus, X } from 'lucide-react';
import { AnimatePresence, LayoutGroup, m } from 'motion/react';
import { useRef, type ReactNode, type Ref } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { AlertCadence } from '@kestrel/shared';
import { springs, tweens } from '@kestrel/ui';

import {
  CadenceControl,
  DeadlineControl,
  FitControl,
  KeywordsControl,
  LocationControl,
  TypesControl,
} from './controls';
import {
  CLAUSE_LABELS,
  OPTIONAL_CLAUSES,
  cadencePhrase,
  clausePhrase,
  fitPhrase,
  type DraftErrors,
  type DraftField,
  type OptionalClause,
  type RuleDraft,
} from '../lib/rule-draft';

export type TokenId = 'fit' | OptionalClause | 'cadence';

const CLAUSE_FIELD: Record<OptionalClause, DraftField> = {
  type: 'types',
  deadline: 'deadlineDays',
  location: 'locations',
  keywords: 'keywords',
};

const TOKEN_TESTID: Record<TokenId, string> = {
  fit: 'alerts-cond-fit',
  type: 'alerts-cond-type',
  deadline: 'alerts-cond-deadline',
  location: 'alerts-cond-location',
  keywords: 'alerts-cond-keywords',
  cadence: 'alerts-cadence',
};

const TOKEN_LABEL: Record<TokenId, string> = {
  fit: 'Fit',
  type: 'Type',
  deadline: 'Deadline',
  location: 'Location',
  keywords: 'Keywords',
  cadence: 'Frequency',
};

const layoutTransition = { layout: springs.gentle };

/** Inline words between tokens; they travel with the reflow but never scale. */
function Word({
  children,
  className,
  ref,
}: {
  children: ReactNode;
  className?: string;
  ref?: Ref<HTMLSpanElement>;
}) {
  return (
    <m.span ref={ref} layout="position" transition={layoutTransition} className={cn('text-fg-secondary', className)}>
      {children}
    </m.span>
  );
}

const tokenBase =
  'press inline-flex h-8 max-w-full items-center gap-1 rounded-xs px-2 text-body font-medium transition-colors duration-fast focus-visible:focus-ring pointer-coarse:min-h-11';

function Token({
  id,
  label,
  open,
  onOpenChange,
  invalid,
  describedBy,
  onRemove,
  children,
  popoverClassName,
  ref,
}: {
  ref?: Ref<HTMLSpanElement>;
  id: TokenId;
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invalid: boolean;
  describedBy?: string;
  onRemove?: () => void;
  children: ReactNode;
  popoverClassName?: string;
}) {
  const tone = invalid
    ? 'bg-danger-subtle text-danger ring-1 ring-danger/60'
    : 'bg-accent-subtle text-accent-subtle-fg hover:ring-1 hover:ring-accent-strong/40';
  return (
    <m.span
      ref={ref}
      layout="position"
      transition={layoutTransition}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1, transition: springs.snappy }}
      exit={{ opacity: 0, scale: 0.92, transition: tweens.exit }}
      className="inline-flex max-w-full items-center"
    >
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid={TOKEN_TESTID[id]}
            data-token={id}
            aria-label={`${TOKEN_LABEL[id]}: ${label}`}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className={cn(tokenBase, tone, onRemove && 'rounded-r-none pr-1.5')}
          >
            <span className="truncate">{label}</span>
            <ChevronDown
              className={cn('size-3.5 shrink-0 opacity-70 transition-transform duration-fast', open && 'rotate-180')}
              strokeWidth={2}
              aria-hidden="true"
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          aria-label={`${TOKEN_LABEL[id]} condition`}
          className={cn('w-80 max-w-[calc(100vw-2rem)] p-3', popoverClassName)}
          onOpenAutoFocus={(e) => {
            // Focus the first real control (input or selected option), not the popover itself.
            const root = (e.currentTarget ?? e.target) as HTMLElement | null;
            const target =
              root?.querySelector<HTMLElement>('input:not([type=hidden]), [data-state=on], [data-state=checked]') ??
              null;
            if (target) {
              e.preventDefault();
              target.focus();
            }
          }}
        >
          {children}
        </PopoverContent>
      </Popover>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${TOKEN_LABEL[id].toLowerCase()} condition`}
          className={cn(
            tokenBase,
            tone,
            'w-7 justify-center rounded-l-none border-l border-surface/60 px-0 pointer-coarse:w-11',
          )}
        >
          <X className="size-3.5" strokeWidth={2} aria-hidden="true" />
        </button>
      ) : null}
    </m.span>
  );
}

function ChannelToggle({
  channel,
  on,
  onToggle,
  invalid,
  describedBy,
}: {
  channel: 'push' | 'inapp';
  on: boolean;
  onToggle: () => void;
  invalid: boolean;
  describedBy?: string;
}) {
  const Icon = channel === 'push' ? BellRing : Inbox;
  const label = channel === 'push' ? 'Push' : 'In-app';
  return (
    <m.button
      type="button"
      layout="position"
      transition={layoutTransition}
      data-testid={`alerts-channel-${channel}`}
      aria-pressed={on}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onClick={onToggle}
      className={cn(
        tokenBase,
        on
          ? 'bg-accent-subtle text-accent-subtle-fg hover:ring-1 hover:ring-accent-strong/40'
          : 'border border-dashed border-border-strong bg-transparent text-fg-tertiary hover:bg-surface-hover hover:text-fg-secondary',
        invalid && 'ring-1 ring-danger/60',
      )}
    >
      <span className="relative grid size-4 place-items-center" aria-hidden="true">
        <AnimatePresence initial={false} mode="popLayout">
          {on ? (
            <m.span
              key="on"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1, transition: springs.snappy }}
              exit={{ scale: 0.6, opacity: 0, transition: tweens.exit }}
            >
              <Check className="size-3.5" strokeWidth={2.25} />
            </m.span>
          ) : (
            <m.span
              key="off"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: tweens.fadeIn }}
              exit={{ opacity: 0, transition: tweens.exit }}
            >
              <Icon className="size-3.5" strokeWidth={1.75} />
            </m.span>
          )}
        </AnimatePresence>
      </span>
      {label}
    </m.button>
  );
}

export interface SentenceBuilderProps {
  draft: RuleDraft;
  update: (fn: (d: RuleDraft) => RuleDraft) => void;
  /** Errors to show now (already filtered by touched/submitted). */
  errors: DraftErrors;
  /** id of the element describing each field's error. */
  errorId: (field: DraftField) => string;
  openToken: TokenId | null;
  setOpenToken: (id: TokenId | null) => void;
  /** A popover closed: reveal that field's validation. */
  onTouch: (field: DraftField) => void;
  zone: string;
}

export function SentenceBuilder({
  draft,
  update,
  errors,
  errorId,
  openToken,
  setOpenToken,
  onTouch,
  zone,
}: SentenceBuilderProps) {
  const addRef = useRef<HTMLButtonElement>(null);
  const pendingOpen = useRef<OptionalClause | null>(null);
  const remaining = OPTIONAL_CLAUSES.filter((c) => !draft.clauses.includes(c));

  const openChange = (id: TokenId, field: DraftField) => (open: boolean) => {
    setOpenToken(open ? id : null);
    if (!open) onTouch(field);
  };

  const removeClause = (clause: OptionalClause) => {
    update((d) => ({ ...d, clauses: d.clauses.filter((c) => c !== clause) }));
    if (openToken === clause) setOpenToken(null);
    // Keep focus in the sentence: the add button always exists once a clause is gone.
    requestAnimationFrame(() => addRef.current?.focus());
  };

  const toggleChannel = (channel: 'push' | 'inapp') => {
    update((d) => ({
      ...d,
      channels: d.channels.includes(channel) ? d.channels.filter((c) => c !== channel) : [...d.channels, channel],
    }));
    onTouch('channels');
  };

  const describe = (field: DraftField) => (errors[field] ? errorId(field) : undefined);

  const clauseControl = (clause: OptionalClause) => {
    switch (clause) {
      case 'type':
        return <TypesControl value={draft.types} onChange={(types) => update((d) => ({ ...d, types }))} />;
      case 'deadline':
        return (
          <DeadlineControl
            value={draft.deadlineDays}
            onChange={(deadlineDays) => update((d) => ({ ...d, deadlineDays }))}
          />
        );
      case 'location':
        return (
          <LocationControl
            remote={draft.remote}
            locations={draft.locations}
            onRemote={(remote) => update((d) => ({ ...d, remote }))}
            onLocations={(locations) => update((d) => ({ ...d, locations }))}
          />
        );
      case 'keywords':
        return <KeywordsControl value={draft.keywords} onChange={(keywords) => update((d) => ({ ...d, keywords }))} />;
    }
  };

  return (
    <LayoutGroup id="alert-sentence">
      <div
        role="group"
        aria-label="Rule"
        data-testid="alerts-sentence"
        className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-body-lg leading-8"
      >
        <Word className="font-display text-h3 text-fg">When</Word>
        <Token
          id="fit"
          label={fitPhrase(draft)}
          open={openToken === 'fit'}
          onOpenChange={openChange('fit', 'minFit')}
          invalid={Boolean(errors.minFit)}
          describedBy={describe('minFit')}
          popoverClassName="w-72"
        >
          <FitControl value={draft.minFit} onChange={(minFit) => update((d) => ({ ...d, minFit }))} />
        </Token>
        <AnimatePresence initial={false} mode="popLayout">
          {draft.clauses.flatMap((clause) => [
            <Word key={`${clause}-and`}>and</Word>,
            <Token
              key={clause}
              id={clause}
              label={clausePhrase(clause, draft)}
              open={openToken === clause}
              onOpenChange={openChange(clause, CLAUSE_FIELD[clause])}
              invalid={Boolean(errors[CLAUSE_FIELD[clause]])}
              describedBy={describe(CLAUSE_FIELD[clause])}
              onRemove={() => removeClause(clause)}
            >
              {clauseControl(clause)}
            </Token>,
          ])}
        </AnimatePresence>
        {remaining.length > 0 ? (
          <m.span layout="position" transition={layoutTransition} className="inline-flex">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  ref={addRef}
                  type="button"
                  data-testid="alerts-add-condition"
                  className={cn(
                    tokenBase,
                    'border border-dashed border-border-strong font-normal text-fg-secondary hover:bg-surface-hover hover:text-fg',
                  )}
                >
                  <Plus className="size-3.5" strokeWidth={2} aria-hidden="true" />
                  condition
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-48"
                onCloseAutoFocus={(e) => {
                  const next = pendingOpen.current;
                  if (!next) return;
                  e.preventDefault();
                  pendingOpen.current = null;
                  setOpenToken(next);
                }}
              >
                <DropdownMenuLabel>Add a condition</DropdownMenuLabel>
                {remaining.map((clause) => (
                  <DropdownMenuItem
                    key={clause}
                    onSelect={() => {
                      pendingOpen.current = clause;
                      update((d) => ({ ...d, clauses: [...d.clauses, clause] }));
                    }}
                  >
                    {CLAUSE_LABELS[clause]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </m.span>
        ) : null}

        <span className="basis-full" aria-hidden="true" />

        <Word className="inline-flex items-center gap-1.5">
          <ArrowRight className="size-4 text-fg-tertiary" strokeWidth={1.5} aria-hidden="true" />
          notify me by
        </Word>
        <ChannelToggle
          channel="push"
          on={draft.channels.includes('push')}
          onToggle={() => toggleChannel('push')}
          invalid={Boolean(errors.channels)}
          describedBy={describe('channels')}
        />
        <ChannelToggle
          channel="inapp"
          on={draft.channels.includes('inapp')}
          onToggle={() => toggleChannel('inapp')}
          invalid={Boolean(errors.channels)}
          describedBy={describe('channels')}
        />
        <Token
          id="cadence"
          label={cadencePhrase(draft)}
          open={openToken === 'cadence'}
          onOpenChange={openChange('cadence', 'digestTime')}
          invalid={Boolean(errors.cadence ?? errors.digestTime)}
          describedBy={describe('digestTime') ?? describe('cadence')}
          popoverClassName="w-72"
        >
          <CadenceControl
            cadence={draft.cadence}
            digestTime={draft.digestTime}
            digestDay={draft.digestDay}
            zone={zone}
            timeError={errors.digestTime}
            onCadence={(cadence: AlertCadence) => update((d) => ({ ...d, cadence }))}
            onTime={(digestTime) => update((d) => ({ ...d, digestTime }))}
            onDay={(digestDay) => update((d) => ({ ...d, digestDay }))}
          />
        </Token>
      </div>
    </LayoutGroup>
  );
}
