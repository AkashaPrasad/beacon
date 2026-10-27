import { animate, m, useMotionValue, useTransform } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, type ComponentProps } from 'react';

import { cn } from './cn';
import { clampScore, fitAccessibleLabel, fitBandOf } from './fit';
import { fitRingOnce } from './fit-session';
import { usePrefersReducedMotion } from './hooks';
import { springs, tweens } from './motion';

export type FitRingSize = 24 | 28 | 32 | 40 | 64 | 160;

/** DESIGN §6.2 ScoreRing geometry: stroke widths and number sizes per ring size. */
const GEOMETRY: Record<FitRingSize, { stroke: number; font: number }> = {
  24: { stroke: 3, font: 10 },
  28: { stroke: 3, font: 11 },
  32: { stroke: 3.5, font: 12 },
  40: { stroke: 3.5, font: 14 },
  64: { stroke: 5, font: 20 },
  160: { stroke: 10, font: 48 },
};

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export interface FitRingProps extends Omit<ComponentProps<'div'>, 'children' | 'role'> {
  /** 0..100. */
  score: number;
  size?: FitRingSize;
  /** Band name placement: under the ring (comfortable rows), to the right (drawer), or tooltip-only. */
  label?: 'none' | 'below' | 'right';
  /**
   * Stable id (usually the listing id). The arc fills and the number counts up only the first time
   * this id scrolls into view in a session (MOTION §5.9). Omit it to render statically.
   */
  animateId?: string;
  /** AI re-rank pending: the deterministic score shows on a dotted track. Never a spinner. */
  pending?: boolean;
}

/**
 * The fit score as an SVG ring with the number in the middle and the band name available as text.
 * `role="img"` with `aria-label="Fit 86 of 100, strong fit"`. The arc is a Motion `pathLength` on
 * `springs.data` (never overshoots); the number counts with `tweens.count`. Both retarget when the
 * score changes, and neither re-renders React per frame. Under reduced motion it renders filled.
 */
export function FitRing({
  score,
  size = 28,
  label = 'none',
  animateId,
  pending = false,
  className,
  ...props
}: FitRingProps) {
  const target = clampScore(score);
  const band = fitBandOf(target);
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const progress = useMotionValue(target / 100);
  const count = useMotionValue(target);
  const rounded = useTransform(count, (v) => Math.round(v));
  const arcOpacity = useTransform(progress, (v) => (v < 0.004 ? 0 : 1));
  const armed = useRef(false);

  // First view this session: start empty, then fill when the ring scrolls into view.
  useIsoLayoutEffect(() => {
    if (!animateId || reduced || typeof IntersectionObserver === 'undefined') return undefined;
    if (!fitRingOnce.first(animateId)) return undefined;
    progress.set(0);
    count.set(0);
    armed.current = true;
    const node = ref.current;
    let controls: { stop: () => void }[] = [];
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        armed.current = false;
        controls = [
          animate(progress, clampScore(score) / 100, springs.data),
          animate(count, clampScore(score), tweens.count),
        ];
      },
      { threshold: 0.6 },
    );
    if (node) observer.observe(node);
    return () => {
      observer.disconnect();
      controls.forEach((c) => c.stop());
      // Never got to play (StrictMode's dev re-run, or unmounted before it scrolled into view):
      // release the id so the next mount can claim it, and leave the ring showing its value.
      if (armed.current) {
        armed.current = false;
        fitRingOnce.forget(animateId);
        progress.set(clampScore(score) / 100);
        count.set(clampScore(score));
      }
    };
    // Only on mount / id change: later score changes retarget below.
  }, [animateId, reduced]);

  // Score changed (e.g. weights edited): retarget from the current value, or jump under reduced motion.
  useEffect(() => {
    if (armed.current) return undefined;
    if (reduced) {
      progress.set(target / 100);
      count.set(target);
      return undefined;
    }
    if (progress.get() === target / 100 && count.get() === target) return undefined;
    const a = animate(progress, target / 100, springs.data);
    const b = animate(count, target, tweens.count);
    return () => {
      a.stop();
      b.stop();
    };
  }, [target, reduced, progress, count]);

  const { stroke, font } = GEOMETRY[size];
  const radius = (size - stroke) / 2;
  const center = size / 2;

  return (
    <div
      ref={ref}
      role="img"
      aria-label={fitAccessibleLabel(target)}
      data-band={band.key}
      data-score={target}
      className={cn(
        'inline-flex shrink-0 items-center',
        label === 'below' ? 'flex-col gap-0.5' : 'gap-2',
        className,
      )}
      {...props}
    >
      <span
        className="relative inline-grid place-items-center"
        style={{ width: size, height: size }}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden="true"
          focusable="false"
          className="-rotate-90"
        >
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="var(--color-fit-track)"
            strokeWidth={stroke}
            strokeDasharray={pending ? `1 ${stroke + 1}` : undefined}
            strokeLinecap={pending ? 'round' : undefined}
          />
          <m.circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={`var(${band.colorVar})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            style={{ pathLength: progress, opacity: arcOpacity }}
          />
        </svg>
        <m.span
          aria-hidden="true"
          className="absolute inset-0 grid place-items-center font-mono font-medium tabular-nums text-fg"
          style={{ fontSize: font, lineHeight: 1 }}
        >
          {rounded}
        </m.span>
      </span>
      {label !== 'none' && (
        <span
          aria-hidden="true"
          className={cn(
            'whitespace-nowrap text-caption',
            // Labels read in fg-secondary (AA); the band colour lives in the stroke. Strong fit keeps evergreen.
            band.key === 'great' ? 'text-fit-great' : 'text-fg-secondary',
          )}
        >
          {label === 'right' ? `${target} · ${band.label}` : band.label}
        </span>
      )}
    </div>
  );
}
