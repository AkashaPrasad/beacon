import type { LucideIcon } from 'lucide-react';
import { m } from 'motion/react';
import { useRef, type KeyboardEvent, type ReactNode } from 'react';

import { press, springs } from '@/features/onboarding/lib/motion';
import { cn } from '@kestrel/ui';

export interface RadioCardOption<T extends string> {
  value: T;
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  testId?: string;
  disabled?: boolean;
}

export interface RadioCardsProps<T extends string> {
  value: T | null;
  onChange: (value: T) => void;
  options: readonly RadioCardOption<T>[];
  'aria-labelledby'?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  className?: string;
  'data-testid'?: string;
}

/**
 * Single-choice cards (AI provider, the consent choice). WAI-ARIA radio group: one Tab stop, arrows
 * move and select. `value: null` means nothing chosen yet (the first card takes the Tab stop).
 */
export function RadioCards<T extends string>({ value, onChange, options, className, ...aria }: RadioCardsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.filter((o) => !o.disabled);
  const checkedIndex = options.findIndex((o) => o.value === value);

  function move(index: number, delta: number) {
    const current = enabled.indexOf(options[index]!);
    const next = enabled[(current + delta + enabled.length) % enabled.length];
    if (!next) return;
    onChange(next.value);
    refs.current[options.indexOf(next)]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      move(index, 1);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      move(index, -1);
    }
  }

  return (
    <div
      role="radiogroup"
      aria-labelledby={aria['aria-labelledby']}
      aria-label={aria['aria-label']}
      aria-describedby={aria['aria-describedby']}
      data-testid={aria['data-testid']}
      className={cn('grid gap-2', className)}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        const Icon = option.icon;
        const tabbable = checked || (checkedIndex === -1 && index === 0);
        return (
          <m.button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={option.disabled}
            tabIndex={tabbable ? 0 : -1}
            data-state={checked ? 'on' : 'off'}
            data-value={option.value}
            data-testid={option.testId}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
            {...(option.disabled ? {} : press.card)}
            className={cn(
              'flex w-full min-w-0 items-start gap-3 rounded-md border p-3 text-left transition-colors duration-fast ease-out',
              'focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-60',
              checked
                ? 'border-accent-strong bg-accent-subtle text-accent-subtle-fg'
                : 'border-border bg-surface-raised text-fg hover:border-border-strong hover:bg-surface-hover',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border transition-colors duration-fast',
                checked ? 'border-transparent bg-accent' : 'border-border-input bg-surface-raised',
              )}
            >
              <m.span
                initial={false}
                animate={{ scale: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
                transition={springs.snappy}
                className="size-1.5 rounded-full bg-accent-fg"
              />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-2 text-body font-medium">
                {Icon && <Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />}
                {option.title}
              </span>
              {option.description && (
                <span className={cn('text-small', checked ? 'text-accent-subtle-fg' : 'text-fg-tertiary')}>
                  {option.description}
                </span>
              )}
            </span>
          </m.button>
        );
      })}
    </div>
  );
}
