import { Check, Plus, type LucideIcon } from 'lucide-react';
import { m } from 'motion/react';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import { TONE_TILE, type Tone } from '@/features/onboarding/flow/tones';
import { rowVariants, springs } from '@/features/onboarding/lib/motion';
import { isEditableTarget } from '@/lib/shortcuts';
import { cn, Kbd, stagger } from '@kestrel/ui';

export interface CardOption {
  value: string;
  label: ReactNode;
  /** Plain label for the accessible name when `label` isn't a string. */
  name?: string;
  hint?: ReactNode;
  media?: ReactNode;
  /** Coloured icon tile on the left (types, roles, interests). */
  icon?: LucideIcon;
  tone?: Tone;
  /** Extra data-* attributes (e.g. `data-type` for the QA specs). */
  data?: Record<`data-${string}`, string>;
}

export interface OptionCardsProps {
  options: readonly CardOption[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  multiple?: boolean;
  /** Max selections (multiple only). */
  max?: number;
  'aria-label': string;
  /** Number keys 1–9 toggle options (only one group per page should own them). */
  hotkeys?: boolean;
  columns?: 1 | 2 | 3;
  size?: 'md' | 'sm';
  testId?: string;
  /** Single select: Enter on a card also continues (called after selecting it). */
  onEnter?: () => void;
  className?: string;
}

/**
 * Option cards for one-question pages: a roving-tabindex group (arrows move, Space toggles, Enter
 * continues), number-key shortcuts shown as key caps on fine pointers, a check that springs in, and the
 * selected state carried by border, fill and the check (never colour alone).
 */
export function OptionCards({
  options,
  value,
  onChange,
  multiple = false,
  max,
  hotkeys = false,
  columns = 2,
  size = 'md',
  testId = 'onboarding-option',
  onEnter,
  className,
  ...aria
}: OptionCardsProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const firstSelected = options.findIndex((o) => value.includes(o.value));
  const [active, setActive] = useState(firstSelected === -1 ? 0 : firstSelected);
  const selected = new Set(value);
  const latest = useRef({ value, options, onChange, multiple, max });
  useEffect(() => {
    latest.current = { value, options, onChange, multiple, max };
  });

  function toggle(option: string) {
    const { value: current, onChange: change, multiple: many, max: limit } = latest.current;
    if (!many) {
      change([option]);
      return;
    }
    if (current.includes(option)) change(current.filter((v) => v !== option));
    else if (!limit || current.length < limit) change([...current, option]);
  }

  // 1–9 toggle the nth option while focus isn't in a text field.
  useEffect(() => {
    if (!hotkeys) return undefined;
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if (!/^[1-9]$/.test(e.key) || isEditableTarget(e.target)) return;
      const i = Number(e.key) - 1;
      const option = latest.current.options[i];
      if (!option) return;
      e.preventDefault();
      toggle(option.value);
      setActive(i);
      refs.current[i]?.focus({ preventScroll: true });
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hotkeys]);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const cols =
      typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches
        ? columns
        : 1;
    let next: number;
    if (e.key === 'ArrowRight') next = i + 1;
    else if (e.key === 'ArrowLeft' && !e.altKey) next = i - 1;
    else if (e.key === 'ArrowDown') next = i + cols;
    else if (e.key === 'ArrowUp') next = i - cols;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    else if (e.key === ' ') {
      e.preventDefault();
      toggle(options[i]!.value);
      return;
    } else if (e.key === 'Enter') {
      // Enter continues (the Question handles it) instead of toggling; a single choice is picked first.
      e.preventDefault();
      if (!multiple && !selected.has(options[i]!.value)) {
        toggle(options[i]!.value);
        onEnter?.();
      }
      return;
    } else return;
    e.preventDefault();
    const clamped = Math.max(0, Math.min(options.length - 1, next));
    setActive(clamped);
    refs.current[clamped]?.focus();
  }

  return (
    <div
      role={multiple ? 'group' : 'radiogroup'}
      aria-label={aria['aria-label']}
      className={cn(
        'grid gap-2.5',
        columns === 1
          ? 'grid-cols-1'
          : columns === 2
            ? 'sm:grid-cols-2'
            : 'sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {options.map((option, i) => {
        const on = selected.has(option.value);
        const delay = stagger(i);
        const name =
          option.name ?? (typeof option.label === 'string' ? option.label : option.value);
        return (
          <m.button
            key={option.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            variants={rowVariants}
            custom={i}
            initial={delay === null ? false : 'hidden'}
            animate="visible"
            role={multiple ? 'checkbox' : 'radio'}
            aria-checked={on}
            tabIndex={i === active ? 0 : -1}
            aria-keyshortcuts={hotkeys && i < 9 ? String(i + 1) : undefined}
            aria-label={name}
            data-option=""
            data-testid={testId}
            data-value={option.value}
            data-selected={on}
            {...option.data}
            onFocus={() => setActive(i)}
            onClick={() => toggle(option.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'press-card group relative flex w-full items-center gap-3 rounded-xl border text-left',
              'transition-[background-color,border-color,box-shadow] duration-fast ease-out focus-visible:focus-ring',
              size === 'md' ? 'min-h-16 px-4 py-3' : 'min-h-12 px-3 py-2',
              on
                ? 'border-accent-strong bg-accent-subtle shadow-[inset_0_0_0_1px_var(--color-accent-strong)]'
                : 'border-border-subtle bg-surface-sunken/60 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] hover:border-border-strong hover:bg-surface-hover',
            )}
          >
            {option.icon ? (
              <span
                aria-hidden="true"
                className={cn(
                  'grid shrink-0 place-items-center rounded-lg',
                  size === 'md' ? 'size-10' : 'size-8',
                  TONE_TILE[option.tone ?? 'cobalt'],
                )}
                data-tone={option.tone ?? 'cobalt'}
              >
                <option.icon className={size === 'md' ? 'size-5' : 'size-4'} strokeWidth={1.75} />
              </span>
            ) : option.media ? (
              <span className="shrink-0">{option.media}</span>
            ) : null}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span
                className={cn('font-medium text-fg', size === 'md' ? 'text-body-lg' : 'text-body')}
              >
                {option.label}
              </span>
              {option.hint && <span className="text-small text-fg-secondary">{option.hint}</span>}
            </span>
            {hotkeys && i < 9 && (
              <Kbd className="hidden shrink-0 pointer-fine:inline-flex" aria-hidden="true">
                {i + 1}
              </Kbd>
            )}
            <span
              aria-hidden="true"
              className={cn(
                'grid size-5 shrink-0 place-items-center rounded-full border transition-colors duration-fast',
                on
                  ? 'border-accent bg-accent text-accent-fg'
                  : 'border-border-strong bg-transparent',
              )}
            >
              <m.span
                initial={false}
                animate={{ scale: on ? 1 : 0.4, opacity: on ? 1 : 0 }}
                transition={springs.snappy}
              >
                <Check className="size-3" strokeWidth={2.5} />
              </m.span>
            </span>
          </m.button>
        );
      })}
    </div>
  );
}

export interface ChipProps {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  children: ReactNode;
  media?: ReactNode;
  'aria-label'?: string;
  testId?: string;
  data?: Record<`data-${string}`, string>;
  disabled?: boolean;
  /** `choice`: one of a set (radio semantics, no plus/check icon). */
  kind?: 'toggle' | 'choice';
}

/** Toggle chip (cities, stack, countries, companies): press state, check springs in when on. */
export function Chip({
  pressed,
  onPressedChange,
  children,
  media,
  testId = 'onboarding-chip',
  data,
  disabled,
  kind = 'toggle',
  ...aria
}: ChipProps) {
  return (
    <button
      type="button"
      role={kind === 'choice' ? 'radio' : undefined}
      aria-checked={kind === 'choice' ? pressed : undefined}
      aria-pressed={kind === 'choice' ? undefined : pressed}
      aria-label={aria['aria-label']}
      disabled={disabled}
      data-testid={testId}
      data-selected={pressed}
      data-option=""
      {...data}
      onClick={() => onPressedChange(!pressed)}
      onKeyDown={(e) => {
        // Space toggles; Enter continues the question (see Question).
        if (e.key === 'Enter') e.preventDefault();
      }}
      className={cn(
        'press inline-flex h-9 max-w-full items-center gap-1.5 rounded-full border px-3 text-body transition-colors duration-fast focus-visible:focus-ring disabled:opacity-50',
        pressed
          ? 'border-accent-strong bg-accent-subtle font-medium text-accent-subtle-fg'
          : 'border-border-subtle bg-surface-sunken/60 text-fg-secondary hover:border-border-strong hover:bg-surface-hover hover:text-fg',
      )}
    >
      {media ??
        (kind === 'choice' ? null : (
          <span aria-hidden="true" className="relative grid size-3.5 shrink-0 place-items-center">
            <m.span
              className="absolute inset-0 grid place-items-center"
              initial={false}
              animate={{ scale: pressed ? 0.5 : 1, opacity: pressed ? 0 : 1 }}
              transition={springs.snappy}
            >
              <Plus className="size-3.5" strokeWidth={2} />
            </m.span>
            <m.span
              className="absolute inset-0 grid place-items-center"
              initial={false}
              animate={{ scale: pressed ? 1 : 0.5, opacity: pressed ? 1 : 0 }}
              transition={springs.snappy}
            >
              <Check className="size-3.5" strokeWidth={2.25} />
            </m.span>
          </span>
        ))}
      <span className="truncate">{children}</span>
    </button>
  );
}
