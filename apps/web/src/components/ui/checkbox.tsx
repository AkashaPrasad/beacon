import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import type * as React from 'react';

import { cn } from '@/lib/utils';

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer hit-area size-4 shrink-0 rounded-xs border border-border-input bg-surface-raised',
        'press-icon',
        'hover:border-fg-tertiary focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:border-accent-strong data-[state=checked]:bg-accent data-[state=checked]:text-accent-fg',
        'data-[state=indeterminate]:border-accent-strong data-[state=indeterminate]:bg-accent data-[state=indeterminate]:text-accent-fg',
        'aria-invalid:border-danger',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current"
      >
        {/* The mark draws in (pathLength, 120 ms ease-out, MOTION §4); indeterminate bar scales in. */}
        <svg
          viewBox="0 0 12 12"
          className="size-3"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          {props.checked === 'indeterminate' ? (
            <path d="M3 6h6" strokeLinecap="round" className="draw-in" pathLength={1} />
          ) : (
            <path
              d="M2.5 6.25 5 8.75l4.5-5.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="draw-in"
              pathLength={1}
            />
          )}
        </svg>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
