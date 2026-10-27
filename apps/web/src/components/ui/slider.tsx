import { Slider as SliderPrimitive } from 'radix-ui';
import * as React from 'react';

import { cn } from '@/lib/utils';

type SliderProps = React.ComponentProps<typeof SliderPrimitive.Root> & {
  /** Fill colour of the range (e.g. the fit band of the current value). */
  rangeClassName?: string;
  thumbClassName?: string;
  /** Accessible names per thumb (Radix puts role=slider on each thumb). */
  thumbLabels?: string[];
};

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  rangeClassName,
  thumbClassName,
  thumbLabels,
  ...props
}: SliderProps) {
  const values = React.useMemo(
    () => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min]),
    [value, defaultValue, min],
  );

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        'relative flex h-5 w-full touch-none select-none items-center data-[disabled]:opacity-50',
        'data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col',
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative grow overflow-hidden rounded-full bg-surface-sunken shadow-[inset_0_0_0_1px_var(--color-border)] data-[orientation=horizontal]:h-1 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className={cn(
            'absolute bg-fg-secondary data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full',
            rangeClassName,
          )}
        />
      </SliderPrimitive.Track>
      {values.map((_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          aria-label={thumbLabels?.[index]}
          className={cn(
            'hit-area block size-4 shrink-0 rounded-full border border-border-input bg-surface-raised shadow-sm',
            'transition-[transform,border-color] duration-fast ease-spring hover:border-fg-tertiary active:scale-110',
            'focus-visible:focus-ring disabled:pointer-events-none disabled:opacity-50',
            thumbClassName,
          )}
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider, type SliderProps };
