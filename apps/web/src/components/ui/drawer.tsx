import { Drawer as DrawerPrimitive } from 'vaul';
import type * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Bottom sheet (Vaul). Drag-dismiss is physics-driven and interruptible; snap points are passed by
 * the caller (detail drawer: `[0.6, 1]`, DESIGN §5). Handle 36×4 `rounded-full` `fg-disabled`.
 */
function Drawer({
  shouldScaleBackground = false,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return (
    <DrawerPrimitive.Root
      data-slot="drawer"
      shouldScaleBackground={shouldScaleBackground}
      {...props}
    />
  );
}
function DrawerTrigger(props: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}
function DrawerPortal(props: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}
function DrawerClose(props: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}
function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      data-slot="drawer-overlay"
      className={cn('fixed inset-0 z-scrim bg-scrim', className)}
      {...props}
    />
  );
}

function DrawerContent({
  className,
  children,
  handleLabel = 'Close',
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content> & {
  /** The drag handle is also a button (DESIGN §9: "Close details"). */
  handleLabel?: string;
}) {
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Content
        data-slot="drawer-content"
        className={cn(
          'group/drawer-content fixed z-modal flex h-auto flex-col bg-surface text-fg shadow-lg outline-none',
          'data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[calc(100dvh-var(--safe-top)-1.5rem)] data-[vaul-drawer-direction=bottom]:rounded-t-xl data-[vaul-drawer-direction=bottom]:border-t data-[vaul-drawer-direction=bottom]:border-border data-[vaul-drawer-direction=bottom]:pb-safe',
          'data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=top]:rounded-b-xl data-[vaul-drawer-direction=top]:border-b data-[vaul-drawer-direction=top]:border-border',
          'data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-[min(100vw-3rem,var(--drawer-w))] data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=right]:border-border',
          'data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-[min(100vw-3rem,var(--rail-w))] data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=left]:border-border',
          className,
        )}
        {...props}
      >
        <DrawerPrimitive.Close
          aria-label={handleLabel}
          className="mx-auto hidden h-6 w-16 shrink-0 place-items-center rounded-full focus-visible:focus-ring group-data-[vaul-drawer-direction=bottom]/drawer-content:grid"
        >
          <span className="h-1 w-9 rounded-full bg-fg-disabled" aria-hidden="true" />
        </DrawerPrimitive.Close>
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
}

function DrawerHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="drawer-header"
      className={cn('flex flex-col gap-1 px-4 pt-1 pb-3', className)}
      {...props}
    />
  );
}
function DrawerFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn('mt-auto flex flex-col gap-2 p-4', className)}
      {...props}
    />
  );
}
function DrawerTitle({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn('text-h2 text-fg', className)}
      {...props}
    />
  );
}
function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn('text-small text-fg-secondary', className)}
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
