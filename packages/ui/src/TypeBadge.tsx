import type { ComponentProps } from 'react';

import { cn } from './cn';
import { TYPE_META, type OpportunityTypeKey } from './types';

export interface TypeBadgeProps extends Omit<ComponentProps<'span'>, 'children'> {
  type: OpportunityTypeKey;
  /** Icon only (the label becomes the accessible name). */
  iconOnly?: boolean;
}

/** Opportunity type chip: canonical lucide icon + word (DESIGN §7). Neutral, never coloured. */
export function TypeBadge({ type, iconOnly = false, className, ...props }: TypeBadgeProps) {
  const { label, icon: Icon } = TYPE_META[type];
  return (
    <span
      data-slot="type-badge"
      {...(iconOnly ? { role: 'img', 'aria-label': label } : {})}
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-xs bg-surface-sunken text-caption font-medium text-fg-secondary',
        iconOnly ? 'w-5 justify-center' : 'px-1.5',
        className,
      )}
      {...props}
    >
      <Icon className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
      {!iconOnly && label}
    </span>
  );
}
