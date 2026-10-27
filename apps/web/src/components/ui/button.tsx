import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Buttons (DESIGN §6.2): primary · secondary · ghost · danger · link; sizes sm 28 / md 36 / lg 44
 * (density-aware through the `h-control*` tokens). One primary per region. Icon-only buttons need an
 * `aria-label` and a tooltip. Press (MOTION §4/§5.1): scale 0.97 (icons 0.92) on pointer-down, spring back
 * on release, via the `press` utility; removed under reduced motion. `bg-accent` always pairs with `text-accent-fg`.
 */
const buttonVariants = cva(
  [
    'press relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium',
    'disabled:pointer-events-none disabled:opacity-50',
    'focus-visible:focus-ring aria-invalid:border-danger',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(' '),
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-fg hover:bg-accent-hover active:bg-accent-active',
        secondary:
          'border border-border bg-surface-raised text-fg hover:border-border-strong hover:bg-surface-hover active:bg-surface-active',
        ghost: 'text-fg-secondary hover:bg-surface-hover hover:text-fg active:bg-surface-active',
        danger: 'bg-danger text-danger-fg hover:opacity-90 active:opacity-80',
        link: 'press-none h-auto px-0 text-accent-strong underline-offset-3 hover:underline active:opacity-70',
        // shadcn aliases, so copied blocks keep working
        default: 'bg-accent text-accent-fg hover:bg-accent-hover active:bg-accent-active',
        outline:
          'border border-border bg-surface-raised text-fg hover:border-border-strong hover:bg-surface-hover active:bg-surface-active',
        destructive: 'bg-danger text-danger-fg hover:opacity-90 active:opacity-80',
      },
      size: {
        sm: 'h-control-sm gap-1.5 px-2.5 text-small',
        md: 'h-control px-3.5 text-body',
        lg: 'h-control-lg px-5 text-body',
        icon: 'press-icon size-control',
        'icon-sm': 'press-icon hit-area size-7 compact:size-6',
        'icon-lg': 'press-icon size-control-lg',
        // shadcn aliases
        default: 'h-control px-3.5 text-body',
        xs: 'h-6 gap-1 px-2 text-caption',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element (e.g. a router `Link`) with button styles. */
    asChild?: boolean;
  };

function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-slot="button"
      data-variant={variant ?? 'secondary'}
      data-size={size ?? 'md'}
      type={asChild ? undefined : (type ?? 'button')}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants, type ButtonProps };
