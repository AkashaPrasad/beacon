import {
  CircleCheck,
  CircleDashed,
  CirclePause,
  CircleX,
  LoaderCircle,
  type LucideIcon,
} from 'lucide-react';


import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { HEALTH_LABELS, type DisplayHealth } from '../lib/health';

const META: Record<DisplayHealth, { icon: LucideIcon; className: string }> = {
  ok: { icon: CircleCheck, className: 'text-success' },
  warning: { icon: CircleDashed, className: 'text-warning' },
  error: { icon: CircleX, className: 'text-danger' },
  paused: { icon: CirclePause, className: 'text-warning' },
  pending: { icon: LoaderCircle, className: 'text-fg-tertiary' },
};

/**
 * Source health: icon + word (never colour alone), reason in the tooltip (DESIGN §10.5).
 * `interactive={false}` renders the same badge without the focusable tooltip trigger, for use inside
 * another control (a phone row button) where a nested tab stop would be invalid.
 */
export function HealthBadge({
  status,
  reason,
  className,
  interactive = true,
  variant = 'word',
}: {
  status: DisplayHealth;
  reason: string;
  className?: string;
  interactive?: boolean;
  /** `icon`: the mark only (distinct shape per status, so colour is never the only signal). */
  variant?: 'word' | 'icon';
}) {
  const { icon: Icon, className: tone } = META[status];
  const content = (
    <>
      <Icon
        className={cn('size-4 shrink-0', tone, status === 'pending' && 'motion-safe:animate-spin')}
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <span
        className={cn(
          status === 'error' && 'text-danger',
          status === 'paused' && 'text-warning',
          variant === 'icon' && 'sr-only',
        )}
      >
        {HEALTH_LABELS[status]}
      </span>
    </>
  );
  const base =
    'inline-flex h-6 items-center gap-1.5 rounded-xs pr-1 text-small whitespace-nowrap text-fg-secondary';
  if (!interactive) {
    return (
      <span data-testid={`sources-health-${status}`} className={cn(base, className)}>
        {content}
      </span>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-testid={`sources-health-${status}`}
          aria-label={`${HEALTH_LABELS[status]}. ${reason}`}
          className={cn(
            base,
            'cursor-default focus-visible:focus-ring',
            variant === 'icon' && 'size-7 justify-center pr-0',
            className,
          )}
        >
          {content}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" align="start">
        {variant === 'icon' ? `${HEALTH_LABELS[status]}. ${reason}` : reason}
      </TooltipContent>
    </Tooltip>
  );
}
