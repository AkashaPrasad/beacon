import type { ComponentProps } from 'react';

import { cn } from './cn';
import { useIsApple } from './hooks';
import { keyLabel } from './keys';

/** One key cap: `mono-sm`, 20 px tall, `rounded-xs`, `border`, `surface-sunken` (DESIGN §6.1). */
export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'pointer-events-none inline-flex h-5 min-w-5 select-none items-center justify-center gap-0.5 rounded-xs border border-border bg-surface-sunken px-1 font-mono text-mono-sm font-normal text-fg-secondary',
        className,
      )}
      {...props}
    />
  );
}

export function KbdGroup({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      data-slot="kbd-group"
      className={cn('inline-flex items-center gap-1', className)}
      {...props}
    />
  );
}

/**
 * Renders a shortcut. Combos use `+` ("mod+k"), sequences use a space ("g r").
 * `aria-hidden` by default: the action's accessible name and `aria-keyshortcuts` carry the meaning.
 */
export function Shortcut({
  keys,
  className,
  ...props
}: { keys: string } & Omit<ComponentProps<'span'>, 'children'>) {
  const apple = useIsApple();
  const steps = keys.trim().split(/\s+/);
  return (
    <KbdGroup aria-hidden="true" className={className} {...props}>
      {steps.map((step, i) => (
        <Kbd key={`${step}-${i}`}>
          {step === '+'
            ? '+'
            : step
                .split('+')
                .map((k) => keyLabel(k, apple))
                .join(apple ? '' : ' ')}
        </Kbd>
      ))}
    </KbdGroup>
  );
}
