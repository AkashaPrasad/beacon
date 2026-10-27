import { Check, type LucideIcon } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import type { ReactNode, Ref } from 'react';

import { press, springs, tweens } from '@/features/onboarding/lib/motion';
import { cn } from '@kestrel/ui';

export interface ToggleCardProps {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  icon?: LucideIcon;
  /** Custom media (favicons) instead of an icon. */
  media?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned meta, e.g. a mono count. */
  meta?: ReactNode;
  disabled?: boolean;
  className?: string;
  'data-testid'?: string;
  /** Extra data attributes for specs. */
  dataAttrs?: Record<`data-${string}`, string>;
  /** `switch` renders role="switch" (pack rows); default is a pressed toggle button. */
  variant?: 'toggle' | 'switch';
  ref?: Ref<HTMLButtonElement>;
}

/**
 * Multi-select card (opportunity types, source packs). Selected = `accent-subtle` background with a
 * check that springs in. Press scales to 0.98 (transform only, so nothing reflows).
 */
export function ToggleCard({
  pressed,
  onPressedChange,
  icon: Icon,
  media,
  title,
  description,
  meta,
  disabled,
  className,
  variant = 'toggle',
  dataAttrs,
  ref,
  ...rest
}: ToggleCardProps) {
  const ariaState =
    variant === 'switch' ? { role: 'switch' as const, 'aria-checked': pressed } : { 'aria-pressed': pressed };
  return (
    <m.button
      ref={ref}
      type="button"
      {...ariaState}
      disabled={disabled}
      data-state={pressed ? 'on' : 'off'}
      data-testid={rest['data-testid']}
      {...dataAttrs}
      onClick={() => onPressedChange(!pressed)}
      {...(disabled ? {} : press.card)}
      className={cn(
        'group relative flex w-full min-w-0 items-start gap-3 rounded-md border p-3 text-left transition-colors duration-fast ease-out',
        'focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-60',
        pressed
          ? 'border-accent-strong bg-accent-subtle text-accent-subtle-fg'
          : 'border-border bg-surface-raised text-fg hover:border-border-strong hover:bg-surface-hover',
        className,
      )}
    >
      {(Icon || media) && (
        <span
          aria-hidden="true"
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-sm transition-colors duration-fast',
            pressed ? 'bg-surface-raised/70 text-accent-subtle-fg' : 'bg-surface-sunken text-fg-secondary',
            media && 'size-auto bg-transparent',
          )}
        >
          {media ?? (Icon && <Icon className="size-5" strokeWidth={1.5} />)}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 text-body font-medium">{title}</span>
          {meta && (
            <span className={cn('shrink-0 font-mono text-mono-sm', pressed ? 'text-accent-subtle-fg' : 'text-fg-tertiary')}>
              {meta}
            </span>
          )}
        </span>
        {description && (
          <span className={cn('text-small', pressed ? 'text-accent-subtle-fg' : 'text-fg-tertiary')}>
            {description}
          </span>
        )}
      </span>
      {variant === 'switch' ? (
        <span
          aria-hidden="true"
          className={cn(
            'relative mt-0.5 inline-flex h-5 w-8 shrink-0 items-center rounded-full border transition-colors duration-fast',
            pressed ? 'border-transparent bg-accent' : 'border-border-input bg-surface-sunken',
          )}
        >
          <m.span
            initial={false}
            animate={{ x: pressed ? 13 : 1 }}
            transition={springs.snappy}
            className={cn('block size-4 rounded-full shadow-sm', pressed ? 'bg-accent-fg' : 'bg-fg-tertiary')}
          />
        </span>
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            'grid size-5 shrink-0 place-items-center rounded-full border transition-colors duration-fast',
            pressed ? 'border-transparent bg-accent text-accent-fg' : 'border-border-input bg-surface-raised',
          )}
        >
          <AnimatePresence initial={false}>
            {pressed && (
              <m.span
                key="check"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1, transition: springs.snappy }}
                exit={{ scale: 0.6, opacity: 0, transition: tweens.exit }}
              >
                <Check className="size-3.5" strokeWidth={2.25} />
              </m.span>
            )}
          </AnimatePresence>
        </span>
      )}
    </m.button>
  );
}
