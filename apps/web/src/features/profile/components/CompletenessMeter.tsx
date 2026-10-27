import { Check, ChevronRight } from 'lucide-react';
import { animate, m, useMotionValue, useTransform } from 'motion/react';
import { useEffect, useRef } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { CompletenessItem } from '@/features/profile/lib/profile-model';
import { springs, tweens, usePrefersReducedMotion, cn  } from '@kestrel/ui';

/** Count-up for a number (MOTION §5.8): tweens.count from the previous value, no React render per frame. */
export function CountUp({ value, className, suffix = '' }: { value: number; className?: string; suffix?: string }) {
  const reduced = usePrefersReducedMotion();
  const mv = useMotionValue(reduced ? value : 0);
  const text = useTransform(mv, (v) => `${Math.round(v)}${suffix}`);
  const first = useRef(true);
  useEffect(() => {
    if (reduced) {
      mv.set(value);
      return undefined;
    }
    const controls = animate(mv, value, first.current ? { ...tweens.count, delay: 0.08 } : tweens.count);
    first.current = false;
    return () => controls.stop();
  }, [value, reduced, mv]);
  return (
    <m.span className={cn('tabular-nums', className)} aria-hidden="true">
      {text}
    </m.span>
  );
}

export interface CompletenessMeterProps {
  percent: number;
  items: readonly CompletenessItem[];
  next: CompletenessItem | null;
  onGo: (key: string) => void;
}

/**
 * Profile completeness: the number counts up on first view, the bar fills with `springs.data` (never
 * overshoots), and the popover lists what's left, each item jumping to its section.
 */
export function CompletenessMeter({ percent, items, next, onGo }: CompletenessMeterProps) {
  const done = items.filter((i) => i.done).length;
  return (
    <div className="flex flex-col gap-2" data-testid="profile-completeness" data-percent={percent}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-small text-fg-secondary">Profile strength</span>
        <span className="font-mono text-mono text-fg">
          <CountUp value={percent} suffix="%" />
          <span className="sr-only">{percent}% complete</span>
        </span>
      </div>
      <div
        role="meter"
        aria-label="Profile completeness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1 overflow-hidden rounded-full bg-surface-sunken"
      >
        <m.div
          className={cn('h-full origin-left rounded-full', percent >= 80 ? 'bg-fit-great' : 'bg-fg-secondary')}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: percent / 100 }}
          transition={springs.data}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        {next ? (
          <button
            type="button"
            onClick={() => onGo(next.key)}
            className="group inline-flex min-w-0 items-center gap-1 rounded-xs text-small font-medium text-accent-strong underline-offset-3 hover:underline focus-visible:focus-ring"
            data-testid="profile-completeness-next"
          >
            <span className="truncate">Next: {next.label.charAt(0).toLowerCase() + next.label.slice(1)}</span>
            <ChevronRight className="size-3.5 shrink-0 transition-transform duration-fast group-hover:translate-x-0.5" strokeWidth={1.5} aria-hidden="true" />
          </button>
        ) : (
          <span className="text-small text-success">Complete. Recruiters see the whole picture.</span>
        )}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="shrink-0 rounded-xs font-mono text-mono-sm text-fg-tertiary underline-offset-3 hover:text-fg hover:underline focus-visible:focus-ring"
              data-testid="profile-completeness-details"
            >
              {done}/{items.length} done
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-2">
            <p className="px-2 pt-1 pb-2 text-caption text-fg-tertiary">Each item improves how listings are ranked for you.</p>
            <ul className="flex flex-col">
              {items.map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => onGo(item.key)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-small transition-colors duration-fast hover:bg-surface-hover hover:duration-0 focus-visible:focus-ring-inset"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'grid size-4 shrink-0 place-items-center rounded-full border',
                        item.done ? 'border-transparent bg-success text-surface-raised' : 'border-border-input',
                      )}
                    >
                      {item.done && <Check className="size-3" strokeWidth={2.5} />}
                    </span>
                    <span className={cn('min-w-0 flex-1', item.done ? 'text-fg-tertiary line-through' : 'text-fg')}>
                      {item.label}
                    </span>
                    <span className="font-mono text-mono-sm text-fg-tertiary">+{item.weight}</span>
                    <span className="sr-only">{item.done ? '(done)' : '(to do)'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
