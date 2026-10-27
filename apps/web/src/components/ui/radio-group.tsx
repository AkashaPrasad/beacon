import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import type * as React from 'react';

import { cn } from '@/lib/utils';

/** Radios: arrows move between options; the dot scales in on `springs.snappy`-like CSS (MOTION §4). */
function RadioGroup({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root data-slot="radio-group" className={cn('grid gap-3', className)} {...props} />;
}

function RadioGroupItem({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        'press-icon hit-area peer grid aspect-square size-4 shrink-0 place-items-center rounded-full border border-border-input bg-surface-raised',
        'hover:border-fg-tertiary focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:border-accent-strong data-[state=checked]:bg-accent',
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="grid place-items-center data-[state=checked]:animate-in data-[state=checked]:zoom-in-0 data-[state=checked]:duration-base data-[state=checked]:ease-spring">
        <span className="size-1.5 rounded-full bg-accent-fg" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupItem };
