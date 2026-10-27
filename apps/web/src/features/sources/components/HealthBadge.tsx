import { CircleCheck, CircleDashed, CirclePause, CircleX, LoaderCircle, type LucideIcon } from 'lucide-react';

import { HEALTH_LABELS, type DisplayHealth } from '../lib/health';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const META: Record<DisplayHealth, { icon: LucideIcon; className: string }> = {
  ok: { icon: CircleCheck, className: 'text-success' },
  warning: { icon: CircleDashed, className: 'text-warning' },
  error: { icon: CircleX, className: 'text-danger' },
  paused: { icon: CirclePause, className: 'text-warning' },
  pending: { icon: LoaderCircle, className: 'text-fg-tertiary' },
};

/** Source health: icon + word (never colour alone), reason in the tooltip (DESIGN §10.5). */
export function HealthBadge({ status, reason, className }: { status: DisplayHealth; reason: string; className?: string }) {
  const { icon: Icon, className: tone } = META[status];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-testid={`sources-health-${status}`}
          tabIndex={0}
          aria-label={`${HEALTH_LABELS[status]}. ${reason}`}
          className={cn(
            'inline-flex h-6 items-center gap-1.5 rounded-xs pr-1 text-small whitespace-nowrap text-fg-secondary focus-visible:focus-ring',
            className,
          )}
        >
          <Icon
            className={cn('size-4 shrink-0', tone, status === 'pending' && 'motion-safe:animate-spin')}
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <span className={cn(status === 'error' && 'text-danger', status === 'paused' && 'text-warning')}>
            {HEALTH_LABELS[status]}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" align="start">
        {reason}
      </TooltipContent>
    </Tooltip>
  );
}
