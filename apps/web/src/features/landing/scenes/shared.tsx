/** Pieces shared by the lazy landing scenes (never in the eager chunk). */
import { AnimatePresence, m, useTransform, type MotionValue } from 'motion/react';

import { BeaconMark } from '@/components/brand/BeaconMark';
import { cn, fitAccessibleLabel, fitBandOf } from '@kestrel/ui';

import { clamp01 } from '../lib/math';
import { pingTween } from '../lib/timing';


const RING_GEOMETRY = { 28: { stroke: 3, font: 11 }, 40: { stroke: 3.5, font: 14 } } as const;

/**
 * A score ring driven by a scroll-linked motion value (`fill` 0..1 = share of the final score), for the
 * scrubbed scenes. Same geometry and colours as `FitRing`; the colour is the final band from the start.
 */
export function ScrubRing({ score, fill, size = 28 }: { score: number; fill: MotionValue<number>; size?: 28 | 40 }) {
  const band = fitBandOf(score);
  const { stroke, font } = RING_GEOMETRY[size];
  const r = (size - stroke) / 2;
  const pathLength = useTransform(fill, (v) => clamp01(v) * (score / 100));
  const arcOpacity = useTransform(pathLength, (v) => (v < 0.004 ? 0 : 1));
  const number = useTransform(fill, (v) => Math.round(clamp01(v) * score));
  return (
    <span role="img" aria-label={fitAccessibleLabel(score)} className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false" className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-fit-track)" strokeWidth={stroke} />
        <m.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`var(${band.colorVar})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          style={{ pathLength, opacity: arcOpacity }}
        />
      </svg>
      <m.span aria-hidden="true" className="absolute inset-0 grid place-items-center font-mono font-medium text-fg tabular-nums" style={{ fontSize: font, lineHeight: 1 }}>
        {number}
      </m.span>
    </span>
  );
}

/** The push the student receives in act 3 (also the static frame under reduced motion). */
export function NotificationCard({ className, ping = 0 }: { className?: string; ping?: number }) {
  return (
    <div className={cn('w-full max-w-72 rounded-lg border border-border bg-overlay p-3 shadow-md', className)}>
      <p className="flex items-center gap-2 text-caption text-fg-tertiary">
        <span className="relative grid size-4 place-items-center">
          <BeaconMark className="size-4 text-accent-strong" />
          <AnimatePresence>
            {ping > 0 && (
              <m.span
                key={ping}
                aria-hidden="true"
                className="absolute size-7 rounded-full border border-accent-strong"
                initial={{ scale: 0.4, opacity: 0.24 }}
                animate={{ scale: 1.6, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={pingTween}
              />
            )}
          </AnimatePresence>
        </span>
        Beacon · now
      </p>
      <p className="mt-1.5 text-body font-medium text-fg">Strong fit: ML Research Intern</p>
      <p className="text-small text-fg-secondary">Meridian AI Lab · Fit 91 · 9d left</p>
    </div>
  );
}
