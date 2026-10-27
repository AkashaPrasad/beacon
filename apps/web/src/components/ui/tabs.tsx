import { cva, type VariantProps } from 'class-variance-authority';
import { m } from 'motion/react';
import { Tabs as TabsPrimitive } from 'radix-ui';
import * as React from 'react';

import { springs } from '@kestrel/ui';
import { cn } from '@/lib/utils';

interface TabsContextValue {
  value: string | undefined;
  layoutId: string;
}
const TabsContext = React.createContext<TabsContextValue>({ value: undefined, layoutId: 'tabs' });

/** Tabs whose active indicator glides between triggers (shared layout, `spring.base`). */
function Tabs({
  className,
  orientation = 'horizontal',
  value,
  defaultValue,
  onValueChange,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const [internal, setInternal] = React.useState(defaultValue);
  const active = value ?? internal;
  const layoutId = React.useId();
  return (
    <TabsContext.Provider value={{ value: active, layoutId }}>
      <TabsPrimitive.Root
        data-slot="tabs"
        data-orientation={orientation}
        orientation={orientation}
        value={active}
        onValueChange={(next) => {
          setInternal(next);
          onValueChange?.(next);
        }}
        className={cn('group/tabs flex gap-3 data-[orientation=horizontal]:flex-col', className)}
        {...props}
      />
    </TabsContext.Provider>
  );
}

const tabsListVariants = cva(
  'group/tabs-list relative inline-flex w-fit items-center text-fg-secondary group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col group-data-[orientation=vertical]/tabs:items-stretch',
  {
    variants: {
      variant: {
        /** Text tabs with a 2 px accent underline (DESIGN §6.1 app nav, notification centre). */
        line: 'gap-4 border-b border-border-subtle group-data-[orientation=vertical]/tabs:gap-0.5 group-data-[orientation=vertical]/tabs:border-b-0',
        /** Segmented control on `surface-sunken`. */
        segmented: 'h-control gap-0.5 rounded-sm bg-surface-sunken p-0.5',
      },
    },
    defaultVariants: { variant: 'line' },
  },
);

function TabsList({
  className,
  variant = 'line',
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  children,
  value,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const ctx = React.useContext(TabsContext);
  const isActive = ctx.value === value;
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      value={value}
      className={cn(
        'relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap text-body font-medium text-fg-secondary outline-none',
        'transition-colors duration-fast hover:text-fg focus-visible:focus-ring disabled:pointer-events-none disabled:opacity-50',
        'data-[state=active]:text-fg',
        // line
        'group-data-[variant=line]/tabs-list:h-control group-data-[variant=line]/tabs-list:px-0.5',
        'group-data-[orientation=vertical]/tabs:justify-start group-data-[orientation=vertical]/tabs:rounded-sm group-data-[orientation=vertical]/tabs:px-3 group-data-[orientation=vertical]/tabs:hover:bg-surface-hover',
        // segmented
        'group-data-[variant=segmented]/tabs-list:h-full group-data-[variant=segmented]/tabs-list:flex-1 group-data-[variant=segmented]/tabs-list:rounded-xs group-data-[variant=segmented]/tabs-list:px-3',
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {isActive && (
        <m.span
          layoutId={ctx.layoutId}
          transition={springs.snappy}
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute',
            'group-data-[variant=line]/tabs-list:inset-x-0 group-data-[variant=line]/tabs-list:-bottom-px group-data-[variant=line]/tabs-list:h-0.5 group-data-[variant=line]/tabs-list:rounded-full group-data-[variant=line]/tabs-list:bg-accent-strong',
            'group-data-[orientation=vertical]/tabs:inset-y-1 group-data-[orientation=vertical]/tabs:-left-px group-data-[orientation=vertical]/tabs:right-auto group-data-[orientation=vertical]/tabs:bottom-auto group-data-[orientation=vertical]/tabs:h-auto group-data-[orientation=vertical]/tabs:w-0.5',
            'group-data-[variant=segmented]/tabs-list:inset-0 group-data-[variant=segmented]/tabs-list:rounded-xs group-data-[variant=segmented]/tabs-list:bg-surface-raised group-data-[variant=segmented]/tabs-list:shadow-sm',
          )}
        />
      )}
      <span className="relative inline-flex items-center gap-1.5">{children}</span>
    </TabsPrimitive.Trigger>
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(
        'flex-1 outline-none focus-visible:focus-ring data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-fade',
        className,
      )}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
