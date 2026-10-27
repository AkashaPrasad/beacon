import { m } from 'motion/react';

import { cn } from '@/lib/utils';
import { createOnceTracker, springs } from '@kestrel/ui';

import { sparkline } from '../lib/sparkline';

const drawn = createOnceTracker();
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Matches per day for the last 7 days (oldest first). The line draws once per session per rule
 * (`pathLength`, `springs.data`: data never overshoots), and the numbers are text for screen readers.
 */
export function Sparkline({
  values,
  id,
  width = 64,
  height = 20,
  className,
  today = new Date(),
}: {
  values: readonly number[];
  /** Stable id (rule id) so the draw-in plays once. */
  id: string;
  width?: number;
  height?: number;
  className?: string;
  today?: Date;
}) {
  const geo = sparkline(values, width, height);
  const first = drawn.first(id);
  const days = values.map((_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (values.length - 1 - i));
    return DAY_NAMES[d.getDay()] ?? '';
  });
  const label = `Matches per day, last ${values.length} days: ${values
    .map((v, i) => `${days[i] ?? ""} ${v}`)
    .join(', ')}. ${geo.total} in total.`;
  return (
    <svg
      role="img"
      aria-label={label}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('shrink-0 overflow-visible text-fg-secondary', className)}
    >
      {geo.area ? <path d={geo.area} fill="currentColor" fillOpacity={0.08} /> : null}
      {geo.path ? (
        <m.path
          d={geo.path}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={first ? { pathLength: 0 } : false}
          animate={{ pathLength: 1 }}
          transition={springs.data}
        />
      ) : null}
      {geo.last ? (
        <circle cx={geo.last.x} cy={geo.last.y} r={2} className="fill-accent-strong" />
      ) : null}
    </svg>
  );
}
