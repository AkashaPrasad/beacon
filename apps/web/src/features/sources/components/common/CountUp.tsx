import { animate } from 'motion/react';
import { useEffect, useRef, type ComponentProps } from 'react';

import { createOnceTracker, tweens, usePrefersReducedMotion } from '@kestrel/ui';

import { formatCount } from '../../lib/format';

/** Ids whose first count-up already played this session (MOTION §5.8: first view only). */
const seen = createOnceTracker();

export interface CountUpProps extends Omit<ComponentProps<'span'>, 'children'> {
  value: number;
  format?: (n: number) => string;
  /** Count from 0 the first time this id renders in the session; otherwise only changes animate. */
  onceId?: string;
}

/**
 * A number that interpolates from its previous value to the new one (`tweens.count`, 240 ms ease-out).
 * Frames write `textContent` directly, so React never re-renders per frame. The width is reserved for
 * the final value (mono, tabular), and screen readers only get the final value.
 */
export function CountUp({
  value,
  format = formatCount,
  onceId,
  className,
  style,
  ...props
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef<number | null>(null);
  const reduced = usePrefersReducedMotion();
  const text = format(value);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const from = previous.current ?? (onceId && seen.first(onceId) ? 0 : value);
    previous.current = value;
    if (reduced || from === value) {
      node.textContent = format(value);
      return undefined;
    }
    const controls = animate(from, value, {
      ...tweens.count,
      onUpdate: (v) => {
        node.textContent = format(Math.round(v));
      },
    });
    return () => controls.stop();
  }, [value, format, onceId, reduced]);

  return (
    <span
      className={className}
      style={{ minWidth: `${text.length}ch`, display: 'inline-block', ...style }}
      {...props}
    >
      <span ref={ref} aria-hidden="true" className="font-mono tabular-nums">
        {text}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
