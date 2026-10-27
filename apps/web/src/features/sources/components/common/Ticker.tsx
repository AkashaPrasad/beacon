import { AnimatePresence, m } from 'motion/react';
import { useState } from 'react';

import { cn } from '@/lib/utils';
import { MOTION_LIMITS, springs, tweens } from '@kestrel/ui';

/**
 * Live count that rolls when it changes (MOTION §5.8 digit roll, simplified to the whole number):
 * the old value leaves upward and the new one arrives from below when increasing (reversed when
 * decreasing), on `springs.snappy`. The first render never animates.
 */
export function Ticker({
  value,
  className,
  label,
}: {
  value: number;
  className?: string;
  label?: string;
}) {
  // "Store information from previous renders" (react.dev): direction of the last change.
  const [last, setLast] = useState({ value, direction: 1 });
  if (last.value !== value) setLast({ value, direction: value > last.value ? 1 : -1 });
  const d = MOTION_LIMITS.distanceMd * last.direction;
  return (
    <span className={cn('relative inline-grid overflow-hidden font-mono tabular-nums', className)}>
      {label ? <span className="sr-only">{label}</span> : null}
      <AnimatePresence initial={false} mode="popLayout" custom={d}>
        <m.span
          key={value}
          aria-hidden={label ? true : undefined}
          className="col-start-1 row-start-1"
          custom={d}
          variants={{
            enter: (dy: number) => ({ y: dy, opacity: 0 }),
            center: { y: 0, opacity: 1, transition: springs.snappy },
            leave: (dy: number) => ({ y: -dy, opacity: 0, transition: tweens.exit }),
          }}
          initial="enter"
          animate="center"
          exit="leave"
        >
          {value.toLocaleString('en-IN')}
        </m.span>
      </AnimatePresence>
    </span>
  );
}
