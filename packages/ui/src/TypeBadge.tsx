import type { ComponentProps } from 'react';

import { cn } from './cn';
import { TYPE_META, type OpportunityTypeKey } from './types';
import { typeTone } from './typeTone';

export interface TypeBadgeProps extends Omit<ComponentProps<'span'>, 'children'> {
  type: OpportunityTypeKey;
  /** Dot only (the label becomes the accessible name). */
  iconOnly?: boolean;
  /** Grey chip instead of the type tint (dense tables). */
  neutral?: boolean;
}

/**
 * Opportunity type pill: text on the type's tint with a small dot in the type colour (DESIGN §2.3).
 * No icon — the company favicon is the one identity visual on a listing (owner, 2026-10-27).
 */
export function TypeBadge({
  type,
  iconOnly = false,
  neutral = false,
  className,
  ...props
}: TypeBadgeProps) {
  const { label } = TYPE_META[type];
  const tone = typeTone(type);
  return (
    <span
      data-slot="type-badge"
      {...(iconOnly ? { role: 'img', 'aria-label': label } : {})}
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full text-caption font-medium text-fg',
        neutral ? 'bg-surface-sunken' : tone.chip,
        iconOnly ? 'w-5 justify-center' : 'px-2',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn('size-1.5 shrink-0 rounded-full', neutral ? 'bg-fg-tertiary' : tone.dot)}
      />
      {!iconOnly && label}
    </span>
  );
}
