/**
 * `FitBreakdown` (DESIGN §6.2): one row per weighted component, a 4 px bar on `surface-sunken`
 * (largest contributor in the band colour, the rest `fg-secondary`), the weight beside the label and
 * the contribution in mono on the right. Bars grow with `springs.data` (never overshoot) and a 20 ms
 * stagger, inside the drawer only. The footer shows the arithmetic: Σ − ghost penalty, then any cap.
 */
import { Ban, Info } from 'lucide-react';
import { m } from 'motion/react';
import { Link } from 'react-router';


import { cn } from '@/lib/utils';
import { DEFAULT_WEIGHTS, SCORE_COMPONENTS, type FitResult } from '@kestrel/shared';
import { fitBandOf, springs, stagger } from '@kestrel/ui';

import { buildFitBreakdown, describeRow, formatPoints, formatWeight } from '../../lib/breakdown';

const BAND_FILL: Record<string, string> = {
  low: 'bg-fit-low',
  mid: 'bg-fit-mid',
  good: 'bg-fit-good',
  great: 'bg-fit-great',
};

export function FitBreakdown({ fit, animate = true }: { fit: FitResult; animate?: boolean }) {
  const view = buildFitBreakdown(fit);
  const band = fitBandOf(fit.score);
  return (
    <section aria-labelledby="fit-breakdown-title" data-testid="drawer-fit-breakdown" className="flex flex-col gap-3">
      <h3 id="fit-breakdown-title" className="text-label text-fg-tertiary uppercase">
        Fit breakdown
      </h3>
      <ul className="flex flex-col gap-2.5">
        {view.rows.map((row, index) => (
          <li key={row.key} className="grid grid-cols-[minmax(0,9.5rem)_1fr_3.25rem] items-center gap-3" aria-label={describeRow(row)}>
            <span className="flex min-w-0 items-baseline gap-1.5" aria-hidden="true">
              <span className="truncate text-small text-fg-secondary">{row.label}</span>
              <span className="font-mono text-mono-sm text-fg-tertiary">{formatWeight(row.weight)}</span>
            </span>
            <span className="relative h-1 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
              <m.span
                data-testid="drawer-fit-bar"
                data-value={row.value.toFixed(3)}
                className={cn('absolute inset-0 origin-left rounded-full', row.isLargest ? BAND_FILL[band.key] : 'bg-fg-secondary')}
                initial={animate ? { scaleX: 0 } : false}
                animate={{ scaleX: row.value }}
                transition={{ ...springs.data, delay: animate ? (stagger(index) ?? 0) : 0 }}
              />
            </span>
            <span
              aria-hidden="true"
              className={cn('text-right font-mono text-mono tabular-nums', row.isLargest ? 'text-fg' : 'text-fg-secondary')}
            >
              {formatPoints(row.contribution)}
            </span>
          </li>
        ))}
        {view.ghostPenalty > 0 && (
          <li className="grid grid-cols-[minmax(0,9.5rem)_1fr_3.25rem] items-center gap-3" aria-label={`Ghost penalty, minus ${formatPoints(view.ghostPenalty, { signed: false })} points`}>
            <span className="truncate text-small text-fg-secondary" aria-hidden="true">
              Ghost penalty
            </span>
            <span className="relative h-1 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
              <m.span
                className="absolute inset-0 origin-left rounded-full bg-ghost-high"
                initial={animate ? { scaleX: 0 } : false}
                animate={{ scaleX: Math.min(1, view.ghostPenalty / 20) }}
                transition={{ ...springs.data, delay: animate ? (stagger(view.rows.length) ?? 0) : 0 }}
              />
            </span>
            <span className="text-right font-mono text-mono text-ghost-high tabular-nums" aria-hidden="true">
              {formatPoints(-view.ghostPenalty)}
            </span>
          </li>
        )}
      </ul>

      <dl className="flex flex-col gap-1 border-t border-border-subtle pt-2 text-caption text-fg-tertiary">
        <div className="flex items-center justify-between gap-3">
          <dt>Total</dt>
          <dd className="font-mono text-mono-sm text-fg-secondary tabular-nums" data-testid="drawer-fit-total">
            {formatPoints(view.rawScore, { signed: false })}
            {view.ghostPenalty > 0 && ` − ${formatPoints(view.ghostPenalty, { signed: false })}`}
            {' = '}
            <span className="text-fg">{fit.score}</span>
          </dd>
        </div>
        {view.cap && (
          <div className="flex items-start gap-1.5 text-fg-secondary" data-testid="drawer-fit-cap">
            <Ban className="mt-0.5 size-3.5 shrink-0 text-fit-low" strokeWidth={1.5} aria-hidden="true" />
            <dd>
              Capped at <span className="font-mono">{view.cap.max}</span>: {view.cap.reason}
            </dd>
          </div>
        )}
        {!view.semanticAvailable && (
          <div className="flex items-start gap-1.5">
            <Info className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            <dd>Profile similarity isn&apos;t available yet, so its weight is shared across the rest.</dd>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <dt>Weights: {isDefaultWeights(fit) ? 'default' : 'custom'}</dt>
          <dd>
            <Link to="/settings" className="text-accent-strong underline-offset-3 hover:underline focus-visible:focus-ring">
              Adjust
            </Link>
          </dd>
        </div>
      </dl>
    </section>
  );
}

function isDefaultWeights(fit: FitResult): boolean {
  if (!fit.semanticAvailable) return true;
  return SCORE_COMPONENTS.every((k) => Math.abs(fit.weights[k] - DEFAULT_WEIGHTS[k]) < 0.005);
}
