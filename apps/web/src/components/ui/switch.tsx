import { Switch as SwitchPrimitive } from 'radix-ui';
import type * as React from 'react';

import { cn } from '@/lib/utils';

/** Toggle switch. The unchecked track uses `border-input` so it meets 3:1 (WCAG 1.4.11). */
function Switch({
  className,
  size = 'md',
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & { size?: 'sm' | 'md' }) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        'peer group/switch hit-area inline-flex shrink-0 items-center rounded-full p-0.5',
        'transition-colors duration-fast ease-out hover:data-[state=unchecked]:bg-fg-tertiary focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-50',
        'data-[size=md]:h-5 data-[size=md]:w-9 data-[size=sm]:h-4 data-[size=sm]:w-7',
        'data-[state=checked]:bg-accent data-[state=checked]:shadow-[0_0_0_3px_var(--color-accent-subtle)] data-[state=unchecked]:bg-border-input',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'pointer-events-none block rounded-full bg-white shadow-md ring-0',
          'transition-transform duration-base ease-spring group-active/switch:scale-x-[1.15] data-[state=unchecked]:origin-left data-[state=checked]:origin-right',
          'group-data-[size=md]/switch:size-4 group-data-[size=sm]/switch:size-3',
          'data-[state=unchecked]:translate-x-0 group-data-[size=md]/switch:data-[state=checked]:translate-x-4 group-data-[size=sm]/switch:data-[state=checked]:translate-x-3',
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
