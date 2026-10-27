/** A number that counts up once when it scrolls into view (static under reduced motion). */
import { animate, m, useInView, useMotionValue, useTransform } from 'motion/react';
import { useEffect, useRef } from 'react';

import { easings, usePrefersReducedMotion } from '@kestrel/ui';

const fmt = new Intl.NumberFormat('en-IN');

export function CountUp({
  value,
  prefix = '',
  suffix = '',
  duration = 1.1,
  className,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduced = usePrefersReducedMotion();
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => `${prefix}${fmt.format(Math.round(v))}${suffix}`);
  useEffect(() => {
    if (!inView) return undefined;
    if (reduced) {
      mv.set(value);
      return undefined;
    }
    const controls = animate(mv, value, { duration, ease: easings.out });
    return () => controls.stop();
  }, [inView, reduced, mv, value, duration]);
  return (
    <span ref={ref} className={className}>
      <span className="inline-grid tabular-nums">
        <span aria-hidden="true" className="invisible col-start-1 row-start-1">
          {prefix}
          {fmt.format(value)}
          {suffix}
        </span>
        <m.span className="col-start-1 row-start-1">{text}</m.span>
      </span>
    </span>
  );
}
