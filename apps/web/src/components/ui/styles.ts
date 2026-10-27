import { cn } from '@/lib/utils';

/**
 * Shared class recipes for floating surfaces (DESIGN §4 shadows/radius, §5 popover motion).
 * Kept in a non-component module so fast refresh stays happy.
 */

/** Popover / menu / select surface: `overlay`, `border`, `shadow-md`, `rounded-lg`, z-popover. */
export const floatingSurface =
  'z-popover e3 overflow-hidden rounded-lg border border-glass-border text-fg outline-none';

/** Enter: opacity + scale 0.98 → 1 from the Radix transform origin (fast). Exit: opacity (fast). */
export const floatingMotion = [
  'origin-(--radix-popper-transform-origin) duration-fast',
  'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-98 data-[state=open]:ease-out',
  'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:ease-in',
  'data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1',
].join(' ');

/** Menu row: 32 px (28 compact), `rounded-md` (nested 12 − 4), hover/keyboard highlight `surface-hover`. */
export const menuItem = [
  'relative flex h-8 cursor-default select-none items-center gap-2 rounded-md px-2 text-body text-fg outline-none compact:h-7',
  'transition-colors duration-fast data-[highlighted]:bg-surface-hover data-[disabled=true]:pointer-events-none data-[disabled=true]:text-fg-disabled',
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-fg-secondary",
].join(' ');

/** Group label in menus and filter rails: `label` style. */
export const menuLabel = 'px-2 pt-2 pb-1 text-label uppercase text-fg-tertiary';

/** Shared control chrome (DESIGN §6.1 Forms): `h-control`, `rounded-sm`, `border-input`, `surface-raised`. */
export const controlClasses = cn(
  'w-full min-w-0 rounded-sm border border-border bg-surface-sunken/70 text-body text-fg shadow-[inset_0_1px_2px_rgb(0_0_0/0.18)]',
  'placeholder:text-fg-tertiary transition-[border-color,box-shadow,background-color] duration-fast ease-out',
  'hover:border-border-strong focus-visible:border-accent focus-visible:bg-surface-raised focus-visible:shadow-[0_0_0_4px_var(--color-accent-subtle)] focus-visible:outline-none',
  'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-fg-disabled',
  'aria-invalid:border-danger',
);

/** Modal scrim: `scrim` colour, fade 120 ms; the only allowed blur (≤ 8 px, DESIGN §1). */
export const scrimClasses =
  'fixed inset-0 z-scrim bg-scrim backdrop-blur-[6px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-fade';
