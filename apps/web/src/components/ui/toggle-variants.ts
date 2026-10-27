import { cva } from 'class-variance-authority';

/** Toggle buttons; "on" uses `accent-subtle` (DESIGN §3.2: selected chip and toggle backgrounds). */
export const toggleVariants = cva(
  [
    'relative inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-sm font-medium text-fg-secondary',
    'transition-[background-color,color,transform] duration-fast ease-out active:scale-[0.97]',
    'hover:bg-surface-hover hover:text-fg focus-visible:focus-ring disabled:pointer-events-none disabled:opacity-50',
    'data-[state=on]:bg-accent-subtle data-[state=on]:text-accent-subtle-fg',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(' '),
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline: 'border border-border bg-surface-raised',
      },
      size: {
        sm: 'h-control-sm min-w-control-sm px-2 text-small',
        md: 'h-control min-w-control px-2.5 text-body',
        lg: 'h-control-lg min-w-control-lg px-3 text-body',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);
