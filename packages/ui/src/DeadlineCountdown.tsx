import type { ComponentProps } from 'react';

import { cn } from './cn';
import { deadlineStatus, type DeadlineKindKey, type DeadlineTone } from './deadline';
import { useNow } from './hooks';

const TONE_CLASS: Record<DeadlineTone, string> = {
  far: 'text-deadline-far',
  near: 'text-deadline-near',
  soon: 'text-deadline-soon',
  today: 'text-deadline-today',
  closed: 'text-fg-disabled',
  rolling: 'text-fg-tertiary',
  unknown: 'text-fg-tertiary',
};

export interface DeadlineCountdownProps extends Omit<ComponentProps<'time'>, 'children'> {
  deadlineAt: Date | null | undefined;
  kind?: DeadlineKindKey;
  /** Freeze the clock (landing demo, tests). Otherwise it refreshes every minute. */
  now?: Date;
}

/**
 * `6d left` · `Due today` · `Due in 5h` · `Closed 2d ago` · `Rolling` in `mono-sm`, coloured by urgency
 * (text only, always words). Wrap in a Tooltip showing `formatAbsolute(deadlineAt)`.
 */
export function DeadlineCountdown({
  deadlineAt,
  kind,
  now,
  className,
  ...props
}: DeadlineCountdownProps) {
  const clock = useNow(60_000, now);
  const status = deadlineStatus(deadlineAt, { now: clock, kind });
  return (
    <time
      data-slot="deadline"
      data-tone={status.tone}
      dateTime={deadlineAt ? deadlineAt.toISOString() : undefined}
      className={cn(
        'whitespace-nowrap font-mono text-mono-sm tabular-nums',
        TONE_CLASS[status.tone],
        className,
      )}
      {...props}
    >
      {status.text}
    </time>
  );
}
