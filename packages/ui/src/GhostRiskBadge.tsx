import type { ComponentProps } from 'react';

import { cn } from './cn';
import { GHOST_META, type GhostRiskLevelKey } from './ghost';

export interface GhostRiskBadgeProps extends Omit<ComponentProps<'span'>, 'children'> {
  level: GhostRiskLevelKey;
  /** Rows render nothing for low risk; the drawer passes `showLow` to say "Looks active". */
  showLow?: boolean;
  /** Icon only (compact rows); the label becomes the accessible name. */
  iconOnly?: boolean;
}

/**
 * Ghost / stale risk: icon + word, `ghost-*` colours on their subtle background (DESIGN §6.2).
 * Wrap it in a Tooltip that lists the signals; it forwards props/ref so it can be an `asChild` trigger.
 */
export function GhostRiskBadge({
  level,
  showLow = false,
  iconOnly = false,
  className,
  ...props
}: GhostRiskBadgeProps) {
  if (level === 'low' && !showLow) return null;
  const { label, icon: Icon, className: tone } = GHOST_META[level];
  return (
    <span
      data-slot="ghost-badge"
      data-level={level}
      {...(iconOnly ? { role: 'img', 'aria-label': label } : {})}
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-xs text-caption font-medium',
        iconOnly ? 'w-5 justify-center' : 'px-1.5',
        tone,
        className,
      )}
      {...props}
    >
      <Icon className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
      {!iconOnly && label}
    </span>
  );
}
