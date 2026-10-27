import type { LucideIcon } from 'lucide-react';
import { LayoutGroup, m } from 'motion/react';
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

import { press, springs } from '@/features/onboarding/lib/motion';
import { cn, layoutIds } from '@kestrel/ui';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: LucideIcon;
  /** Accessible name when `label` is visual only. */
  ariaLabel?: string;
  testId?: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  size?: 'sm' | 'md';
  /** Stretch segments to fill the row (mobile-friendly). */
  fill?: boolean;
  className?: string;
  'data-testid'?: string;
}

/**
 * Single-choice segmented control with a sliding indicator (shared `layoutId`, `springs.snappy`, MOTION.md §5.13).
 * Radio-group semantics: one tab stop, arrows move and select, Home/End jump (WAI-ARIA radio pattern).
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  fill = false,
  className,
  ...aria
}: SegmentedControlProps<T>) {
  const group = useId();
  const layoutId = layoutIds.segmentIndicator(group);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.filter((o) => !o.disabled);

  function move(from: number, delta: number) {
    const current = enabled.findIndex((o) => o.value === options[from]?.value);
    const next = enabled[(current + delta + enabled.length) % enabled.length];
    if (!next) return;
    onChange(next.value);
    refs.current[options.indexOf(next)]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      move(index, 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      move(index, -1);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const target = e.key === 'Home' ? enabled[0] : enabled[enabled.length - 1];
      if (target) {
        onChange(target.value);
        refs.current[options.indexOf(target)]?.focus();
      }
    }
  }

  const hasChecked = options.some((o) => o.value === value);

  return (
    <LayoutGroup id={group}>
      <div
        role="radiogroup"
        aria-label={aria['aria-label']}
        aria-labelledby={aria['aria-labelledby']}
        aria-describedby={aria['aria-describedby']}
        data-testid={aria['data-testid']}
        className={cn(
          'relative inline-flex max-w-full items-stretch gap-0.5 rounded-sm border border-border bg-surface-sunken p-0.5',
          fill && 'flex w-full',
          className,
        )}
      >
        {options.map((option, index) => {
          const checked = option.value === value;
          const Icon = option.icon;
          const tabbable = checked || (!hasChecked && index === 0);
          return (
            <m.button
              key={option.value}
              {...(option.disabled ? {} : press.button)}
              ref={(el) => {
                refs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={option.ariaLabel}
              disabled={option.disabled}
              tabIndex={tabbable ? 0 : -1}
              data-testid={option.testId}
              data-state={checked ? 'on' : 'off'}
              onClick={() => onChange(option.value)}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={cn(
                'relative isolate inline-flex min-w-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-xs px-3 font-medium transition-colors duration-fast ease-out',
                'focus-visible:focus-ring-inset',
                'disabled:cursor-not-allowed disabled:text-fg-disabled',
                size === 'sm' ? 'h-7 text-caption' : 'h-[calc(var(--control-h)-0.25rem)] text-body',
                fill && 'flex-1',
                checked ? 'text-fg' : 'text-fg-secondary hover:text-fg',
              )}
            >
              {checked && (
                <m.span
                  layoutId={layoutId}
                  aria-hidden="true"
                  transition={springs.snappy}
                  className="absolute inset-0 -z-10 rounded-xs border border-border bg-surface-raised shadow-sm"
                />
              )}
              {Icon && <Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />}
              <span className="truncate">{option.label}</span>
            </m.button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
