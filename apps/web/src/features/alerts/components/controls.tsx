/**
 * Popover controls behind each bracket of the sentence builder (DESIGN §6.1 "Alerts rule builder").
 * Each one edits a single clause; smart defaults first, the long tail one step away (BRIEF Addendum).
 */
import { Command as CommandPrimitive } from 'cmdk';
import { Check, Plus, X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useId, useState, type KeyboardEvent } from 'react';

import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import {
  OPPORTUNITY_TYPE_LABELS,
  OPPORTUNITY_TYPES,
  type AlertCadence,
  type OpportunityType,
} from '@kestrel/shared';
import { fitBandOf, springs, tweens, TYPE_META } from '@kestrel/ui';

import {
  DEADLINE_STEPS,
  FIT_STEPS,
  REMOTE_LABELS,
  WEEKDAYS,
  parseTokens,
  type RemoteFilter,
} from '../lib/rule-draft';

const caption = 'text-caption text-fg-tertiary';
const heading = 'text-small font-medium text-fg';

// ── Fit ────────────────────────────────────────────────────────────────────────────────────────

export function FitControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const labelId = useId();
  const steps: number[] = (FIT_STEPS as readonly number[]).includes(value)
    ? [...FIT_STEPS]
    : [...FIT_STEPS, value].sort((a, b) => a - b);
  const band = fitBandOf(value);
  return (
    <div className="flex flex-col gap-3">
      <p id={labelId} className={heading}>
        Minimum fit score
      </p>
      <ToggleGroup
        type="single"
        value={String(value)}
        onValueChange={(v) => v && onChange(Number(v))}
        aria-labelledby={labelId}
        className="grid w-full grid-cols-4 gap-1"
      >
        {steps.map((n) => (
          <ToggleGroupItem key={n} value={String(n)} aria-label={`${n} or more`} className="font-mono">
            {n}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <p className={caption}>
        {value >= 80
          ? 'Strong fits only. The quietest setting.'
          : value >= 60
            ? `${band.label} and better. A few a week for most profiles.`
            : 'Most listings that fit at all. Expect more alerts.'}
      </p>
    </div>
  );
}

// ── Type ───────────────────────────────────────────────────────────────────────────────────────

export function TypesControl({
  value,
  onChange,
}: {
  value: readonly OpportunityType[];
  onChange: (v: OpportunityType[]) => void;
}) {
  const toggle = (t: OpportunityType) =>
    onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t]);
  return (
    <Command label="Opportunity types" className="bg-transparent" loop>
      <div className="flex items-center gap-2 border-b border-border-subtle px-1 pb-2">
        <CommandPrimitive.Input
          placeholder="Filter types"
          aria-label="Filter types"
          className="h-control-sm w-full rounded-sm bg-surface-sunken px-2 text-small text-fg outline-none placeholder:text-fg-tertiary focus-visible:focus-ring"
        />
      </div>
      <CommandList className="max-h-64 px-0 pt-1 pb-0" aria-multiselectable="true">
        <CommandPrimitive.Empty className="px-3 py-4 text-center text-small text-fg-secondary">
          No type matches.
        </CommandPrimitive.Empty>
        <CommandGroup>
          {OPPORTUNITY_TYPES.map((t) => {
            const Icon = TYPE_META[t].icon;
            const selected = value.includes(t);
            return (
              <CommandItem
                key={t}
                value={OPPORTUNITY_TYPE_LABELS[t]}
                onSelect={() => toggle(t)}
                aria-selected={selected}
                data-checked={selected}
                className="h-9"
              >
                <Icon strokeWidth={1.5} aria-hidden="true" />
                <span className="flex-1">{OPPORTUNITY_TYPE_LABELS[t]}</span>
                <span
                  className={cn(
                    'grid size-4 place-items-center rounded-xs border transition-colors duration-fast',
                    selected ? 'border-accent-strong bg-accent text-accent-fg' : 'border-border-input',
                  )}
                  aria-hidden="true"
                >
                  {selected ? <Check className="size-3 text-accent-fg" strokeWidth={2} /> : null}
                </span>
                <span className="sr-only">{selected ? ', selected' : ''}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
      <p className={cn(caption, 'px-1 pt-2')}>
        {value.length === 0 ? 'Pick one or more.' : `${value.length} selected · any of them matches.`}
      </p>
    </Command>
  );
}

// ── Deadline ───────────────────────────────────────────────────────────────────────────────────

export function DeadlineControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const labelId = useId();
  const inputId = useId();
  const [text, setText] = useState(String(value));
  const preset = (DEADLINE_STEPS as readonly number[]).includes(value);
  return (
    <div className="flex flex-col gap-3">
      <p id={labelId} className={heading}>
        Deadline within
      </p>
      <ToggleGroup
        type="single"
        value={preset ? String(value) : ''}
        onValueChange={(v) => {
          if (!v) return;
          onChange(Number(v));
          setText(v);
        }}
        aria-labelledby={labelId}
        className="grid w-full grid-cols-5 gap-1"
      >
        {DEADLINE_STEPS.map((n) => (
          <ToggleGroupItem key={n} value={String(n)} className="px-1 font-mono">
            <span aria-hidden="true">{n}d</span>
            <span className="sr-only">{n} days</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="flex items-center gap-2">
        <Label htmlFor={inputId} className="text-small text-fg-secondary">
          Or exactly
        </Label>
        <Input
          id={inputId}
          type="number"
          inputMode="numeric"
          min={1}
          max={365}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value);
            if (Number.isInteger(n) && n >= 1 && n <= 365) onChange(n);
          }}
          className="h-control-sm w-20 font-mono"
        />
        <span className="text-small text-fg-secondary">days</span>
      </div>
      <p className={caption}>Listings with a rolling or unknown deadline are left out.</p>
    </div>
  );
}

// ── Token input (places, keywords) ─────────────────────────────────────────────────────────────

export function TokenInput({
  label,
  value,
  onChange,
  placeholder,
  suggestions = [],
  max = 20,
  maxLength = 60,
}: {
  label: string;
  value: readonly string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  suggestions?: readonly string[];
  max?: number;
  maxLength?: number;
}) {
  const inputId = useId();
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const incoming = parseTokens(raw, max).map((t) => t.slice(0, maxLength));
    const seen = new Set(value.map((v) => v.toLowerCase()));
    const next = [...value];
    for (const t of incoming) {
      if (next.length >= max) break;
      if (!seen.has(t.toLowerCase())) {
        seen.add(t.toLowerCase());
        next.push(t);
      }
    }
    if (next.length !== value.length) onChange(next);
    setText('');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && text.trim()) {
      e.preventDefault();
      add(text);
    } else if (e.key === 'Backspace' && !text && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  const picks = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()));
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      <div className="flex min-h-control flex-wrap items-center gap-1 rounded-sm border border-border-input bg-surface-raised px-1.5 py-1 focus-within:focus-ring">
        <AnimatePresence initial={false} mode="popLayout">
          {value.map((v) => (
            <m.span
              key={v}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1, transition: springs.snappy }}
              exit={{ opacity: 0, scale: 0.9, transition: tweens.exit }}
              transition={{ layout: springs.gentle }}
              className="inline-flex h-6 items-center gap-0.5 rounded-xs bg-accent-subtle pr-0.5 pl-1.5 text-small text-accent-subtle-fg"
            >
              {v}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== v))}
                aria-label={`Remove ${v}`}
                className="hit-area grid size-5 place-items-center rounded-xs hover:bg-surface-hover focus-visible:focus-ring"
              >
                <X className="size-3" strokeWidth={2} aria-hidden="true" />
              </button>
            </m.span>
          ))}
        </AnimatePresence>
        <input
          id={inputId}
          value={text}
          onChange={(e) => {
            const next = e.target.value;
            if (next.includes(',')) add(next);
            else setText(next);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => text.trim() && add(text)}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData('text');
            if (/[,\n]/.test(pasted)) {
              e.preventDefault();
              add(`${text}${pasted}`);
            }
          }}
          placeholder={value.length ? '' : placeholder}
          maxLength={maxLength}
          disabled={value.length >= max}
          className="h-6 min-w-24 flex-1 bg-transparent px-1 text-small text-fg outline-none placeholder:text-fg-tertiary"
        />
      </div>
      {picks.length ? (
        <div className="flex flex-wrap gap-1" aria-label={`Suggested ${label.toLowerCase()}`} role="group">
          {picks.slice(0, 6).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="press inline-flex h-6 items-center gap-1 rounded-xs bg-surface-sunken px-1.5 text-caption text-fg-secondary hover:bg-surface-hover hover:text-fg focus-visible:focus-ring pointer-coarse:h-9"
            >
              <Plus className="size-3" strokeWidth={2} aria-hidden="true" />
              {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── Location ───────────────────────────────────────────────────────────────────────────────────

const PLACE_SUGGESTIONS = ['Bengaluru', 'Hyderabad', 'Pune', 'Mumbai', 'Delhi NCR', 'Chennai'];

export function LocationControl({
  remote,
  locations,
  onRemote,
  onLocations,
}: {
  remote: RemoteFilter;
  locations: readonly string[];
  onRemote: (v: RemoteFilter) => void;
  onLocations: (v: string[]) => void;
}) {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-3">
      <p id={labelId} className={heading}>
        Work mode
      </p>
      <ToggleGroup
        type="single"
        segmented
        value={remote}
        onValueChange={(v) => v && onRemote(v as RemoteFilter)}
        aria-labelledby={labelId}
        className="w-full"
      >
        {(Object.keys(REMOTE_LABELS) as RemoteFilter[]).map((r) => (
          <ToggleGroupItem key={r} value={r}>
            {REMOTE_LABELS[r]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <TokenInput
        label="Places"
        value={locations}
        onChange={onLocations}
        placeholder="City or country, then Enter"
        suggestions={PLACE_SUGGESTIONS}
        maxLength={120}
      />
      <p className={caption}>A listing matches if it is in any of these places.</p>
    </div>
  );
}

// ── Keywords ───────────────────────────────────────────────────────────────────────────────────

export function KeywordsControl({
  value,
  onChange,
}: {
  value: readonly string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <TokenInput label="Keywords" value={value} onChange={onChange} placeholder="go, rust, design…" />
      <p className={caption}>Every keyword must appear in the title, company or skills.</p>
    </div>
  );
}

// ── Cadence ────────────────────────────────────────────────────────────────────────────────────

const CADENCE_OPTIONS: { value: AlertCadence; label: string; hint: string }[] = [
  { value: 'instant', label: 'Instantly', hint: 'As soon as a listing is scored.' },
  { value: 'daily', label: 'Daily digest', hint: 'One summary a day.' },
  { value: 'weekly', label: 'Weekly digest', hint: 'One summary a week.' },
];

export function CadenceControl({
  cadence,
  digestTime,
  digestDay,
  zone,
  timeError,
  onCadence,
  onTime,
  onDay,
}: {
  cadence: AlertCadence;
  digestTime: string;
  digestDay: number;
  /** "IST" */
  zone: string;
  timeError?: string;
  onCadence: (v: AlertCadence) => void;
  onTime: (v: string) => void;
  onDay: (v: number) => void;
}) {
  const labelId = useId();
  const timeId = useId();
  const dayId = useId();
  const errorId = useId();
  return (
    <div className="flex flex-col gap-3">
      <p id={labelId} className={heading}>
        How often
      </p>
      <RadioGroup
        value={cadence}
        onValueChange={(v) => onCadence(v as AlertCadence)}
        aria-labelledby={labelId}
        className="gap-1"
      >
        {CADENCE_OPTIONS.map((o) => {
          const id = `${labelId}-${o.value}`;
          return (
            <label
              key={o.value}
              htmlFor={id}
              className="flex cursor-default items-start gap-3 rounded-md px-2 py-2 hover:bg-surface-hover has-[[data-state=checked]]:bg-surface-sunken"
            >
              <RadioGroupItem id={id} value={o.value} className="mt-0.5" />
              <span className="flex flex-col">
                <span className="text-small font-medium text-fg">{o.label}</span>
                <span className={caption}>{o.hint}</span>
              </span>
            </label>
          );
        })}
      </RadioGroup>
      <AnimatePresence initial={false}>
        {cadence !== 'instant' ? (
          <m.div
            key="when"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0, transition: springs.smooth }}
            exit={{ opacity: 0, transition: tweens.exit }}
            className="flex flex-wrap items-end gap-2"
          >
            {cadence === 'weekly' ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor={dayId} className="text-small text-fg-secondary">
                  Day
                </Label>
                <Select value={String(digestDay)} onValueChange={(v) => onDay(Number(v))}>
                  <SelectTrigger id={dayId} size="sm" className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((d, i) => (
                      <SelectItem key={d} value={String(i)}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="flex flex-col gap-1">
              <Label htmlFor={timeId} className="text-small text-fg-secondary">
                Time ({zone})
              </Label>
              <Input
                id={timeId}
                type="time"
                step={900}
                value={digestTime}
                onChange={(e) => onTime(e.target.value)}
                aria-invalid={timeError ? true : undefined}
                aria-describedby={timeError ? errorId : undefined}
                className="h-control-sm w-28 font-mono"
              />
            </div>
            {timeError ? (
              <p id={errorId} className="basis-full text-small text-danger">
                {timeError}
              </p>
            ) : null}
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
