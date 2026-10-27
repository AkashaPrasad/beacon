import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type * as React from 'react';

import { cn } from '@/lib/utils';

/** Badges: h 20, `caption` 500, `rounded-sm`. Semantic tones always pair with a word (and usually an icon). */
const badgeVariants = cva(
  'inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-sm px-1.5 text-caption font-medium [&>svg]:pointer-events-none [&>svg]:size-3.5 [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        neutral: 'bg-surface-sunken text-fg-secondary',
        outline: 'border border-border text-fg-secondary',
        dashed: 'border border-dashed border-border-strong text-fg-tertiary',
        accent: 'bg-accent-subtle text-accent-subtle-fg',
        success: 'bg-success-subtle text-success',
        warning: 'bg-warning-subtle text-warning',
        danger: 'bg-danger-subtle text-danger',
        info: 'bg-info-subtle text-info',
        // shadcn aliases
        default: 'bg-surface-sunken text-fg-secondary',
        secondary: 'bg-surface-sunken text-fg-secondary',
        destructive: 'bg-danger-subtle text-danger',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span';
  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge };
