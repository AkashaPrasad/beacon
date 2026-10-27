import type { VariantProps } from 'class-variance-authority';
import { m } from 'motion/react';
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import * as React from 'react';

import { cn } from '@/lib/utils';
import { springs } from '@kestrel/ui';

import { toggleVariants } from './toggle-variants';

interface GroupContext extends VariantProps<typeof toggleVariants> {
  segmented: boolean;
  active: string | string[] | undefined;
  layoutId: string;
}
const ToggleGroupContext = React.createContext<GroupContext>({
  size: 'md',
  variant: 'default',
  segmented: false,
  active: undefined,
  layoutId: 'toggle-group',
});

type ToggleGroupProps = React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleVariants> & {
    /** Segmented control (`[Comfortable | Compact]`, view switch): one sunken track, a gliding thumb. */
    segmented?: boolean;
  };

/**
 * Toggle group. With `segmented` and `type="single"` the selected thumb slides between items with
 * a shared-layout spring instead of popping (Addendum: shared layout where an element moves).
 */
function ToggleGroup({
  className,
  variant,
  size,
  segmented = false,
  children,
  ...props
}: ToggleGroupProps) {
  const layoutId = React.useId();
  const [internal, setInternal] = React.useState<string | string[] | undefined>(props.defaultValue);
  const active = props.value ?? internal;
  const rootProps = {
    ...props,
    onValueChange: (next: string & string[]) => {
      setInternal(next);
      props.onValueChange?.(next);
    },
  } as React.ComponentProps<typeof ToggleGroupPrimitive.Root>;

  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      data-segmented={segmented || undefined}
      className={cn(
        'group/toggle-group flex w-fit items-center gap-1',
        segmented && 'gap-0.5 rounded-sm bg-surface-sunken p-0.5',
        className,
      )}
      {...rootProps}
    >
      <ToggleGroupContext.Provider value={{ variant, size, segmented, active, layoutId }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  value,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> & VariantProps<typeof toggleVariants>) {
  const ctx = React.useContext(ToggleGroupContext);
  const isOn = Array.isArray(ctx.active) ? ctx.active.includes(value) : ctx.active === value;
  const resolvedSize = ctx.size ?? size ?? (ctx.segmented ? 'sm' : 'md');
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      value={value}
      className={cn(
        toggleVariants({ variant: ctx.variant ?? variant, size: resolvedSize }),
        'focus-visible:z-10',
        ctx.segmented &&
          'flex-1 rounded-xs hover:bg-transparent data-[state=on]:bg-transparent data-[state=on]:text-fg',
        className,
      )}
      {...props}
    >
      {ctx.segmented && isOn && (
        <m.span
          layoutId={ctx.layoutId}
          transition={springs.snappy}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-xs bg-surface-raised shadow-sm"
        />
      )}
      <span className="relative inline-flex items-center gap-1.5">{children}</span>
    </ToggleGroupPrimitive.Item>
  );
}

export { ToggleGroup, ToggleGroupItem };
