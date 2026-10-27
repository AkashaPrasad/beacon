import { Check, X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';

import { chipMotion, press, springs, tweens } from '@/features/onboarding/lib/motion';
import { cn } from '@kestrel/ui';

export interface TokenChipsProps {
  items: readonly { value: string; label: string }[];
  onRemove: (value: string) => void;
  'aria-label'?: string;
  className?: string;
  'data-testid'?: string;
}

/** Removable chips for chosen tokens (roles, places). Removal collapses with `layout` (MOTION §5.5). */
export function TokenChips({ items, onRemove, className, ...rest }: TokenChipsProps) {
  if (items.length === 0) return null;
  return (
    <ul aria-label={rest['aria-label']} className={cn('flex flex-wrap gap-1.5', className)} data-testid={rest['data-testid']}>
      <AnimatePresence initial={false} mode="popLayout">
        {items.map((item) => (
          <m.li key={item.value} layout {...chipMotion} className="max-w-full">
            <span className="inline-flex h-7 max-w-full items-center rounded-xs bg-accent-subtle pl-2 text-body text-accent-subtle-fg">
              <span className="truncate">{item.label}</span>
              <button
                type="button"
                onClick={() => onRemove(item.value)}
                aria-label={`Remove ${item.label}`}
                className="ml-0.5 grid h-full place-items-center rounded-r-xs px-1.5 transition-colors duration-fast hover:bg-accent-subtle-fg/10 focus-visible:focus-ring-inset"
              >
                <X className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </span>
          </m.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

export interface ToggleChipProps {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  label: string;
  className?: string;
  'data-testid'?: string;
}

/** Filter-style toggle chip (MOTION §4: `accent-subtle` when on, the check scales 0.6 → 1). */
export function ToggleChip({ pressed, onPressedChange, label, className, ...rest }: ToggleChipProps) {
  return (
    <m.button
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      data-testid={rest['data-testid']}
      data-state={pressed ? 'on' : 'off'}
      {...press.button}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-xs border px-2.5 text-body transition-colors duration-fast',
        'focus-visible:focus-ring',
        pressed
          ? 'border-transparent bg-accent-subtle text-accent-subtle-fg'
          : 'border-border bg-surface-raised text-fg-secondary hover:bg-surface-hover hover:text-fg',
        className,
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {pressed && (
          <m.span
            key="check"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, transition: springs.snappy }}
            exit={{ scale: 0.6, opacity: 0, transition: tweens.exit }}
          >
            <Check className="size-3.5" strokeWidth={2} aria-hidden="true" />
          </m.span>
        )}
      </AnimatePresence>
      {label}
    </m.button>
  );
}
