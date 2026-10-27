/**
 * Fit peek: the row's ring answers "why?" on hover (fine pointer, 400 ms) without opening the drawer.
 * It shows the band, the top contributions, the matched and missing skills and any ghost signals, so
 * the row itself can stay calm (title, company, one meta line, ring, deadline). Everything here is
 * also in the drawer; this is a shortcut, never the only place.
 */
import { CircleCheck, CircleX } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import type { FitResult, GhostReason } from '@kestrel/shared';
import { fitBandOf, ghostLevelOf, GhostRiskBadge } from '@kestrel/ui';

import { buildFitBreakdown, formatPoints } from '../lib/breakdown';

const OPEN_DELAY_MS = 400;
const CLOSE_GRACE_MS = 120;

export function FitPeek({
  fit,
  ghost,
  children,
}: {
  fit: FitResult | null;
  ghost: { score: number; reasons: readonly GhostReason[] };
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const schedule = (next: boolean, ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(next), ms);
  };
  if (!fit) return <>{children}</>;
  const view = buildFitBreakdown(fit);
  const top = [...view.rows].sort((a, b) => b.contribution - a.contribution).slice(0, 3);
  const band = fitBandOf(fit.score);
  const level = ghostLevelOf(ghost.score);
  const matched = [...fit.details.skills.matchedRequired, ...fit.details.skills.matchedNice].slice(
    0,
    4,
  );
  const missing = fit.details.skills.missingRequired.slice(0, 3);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <span
          onPointerEnter={(event) => event.pointerType === 'mouse' && schedule(true, OPEN_DELAY_MS)}
          onPointerLeave={() => schedule(false, CLOSE_GRACE_MS)}
          className="inline-flex"
        >
          {children}
        </span>
      </PopoverAnchor>
      <PopoverContent
        side="left"
        align="center"
        className="w-72 p-3"
        data-testid="radar-fit-peek"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onPointerEnter={() => timer.current && clearTimeout(timer.current)}
        onPointerLeave={() => schedule(false, CLOSE_GRACE_MS)}
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-small text-fg">
          <span className="font-mono font-medium">{fit.score}</span> · {band.label}
        </p>
        <ul className="mt-2 flex flex-col gap-1">
          {top.map((row) => (
            <li
              key={row.key}
              className="flex items-baseline justify-between gap-3 text-caption text-fg-secondary"
            >
              <span className="truncate">{row.label}</span>
              <span className="font-mono text-mono-sm text-fg">
                {formatPoints(row.contribution)}
              </span>
            </li>
          ))}
        </ul>
        {(matched.length > 0 || missing.length > 0) && (
          <ul className="mt-2.5 flex flex-wrap gap-1" aria-label="Skills">
            {matched.map((skill) => (
              <li
                key={skill}
                className="inline-flex h-5 items-center gap-1 rounded-xs bg-surface-sunken px-1.5 text-caption text-fg-secondary"
              >
                <CircleCheck
                  className="size-3 text-fit-good"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                {skill}
              </li>
            ))}
            {missing.map((skill) => (
              <li
                key={skill}
                className="inline-flex h-5 items-center gap-1 rounded-xs border border-dashed border-border-strong px-1.5 text-caption text-fg-tertiary"
              >
                <CircleX className="size-3" strokeWidth={1.5} aria-hidden="true" />
                <span className="sr-only">Missing </span>
                {skill}
              </li>
            ))}
          </ul>
        )}
        {level !== 'low' && (
          <div className="mt-2.5 flex flex-col gap-1 border-t border-border-subtle pt-2">
            <GhostRiskBadge level={level} className="self-start" />
            {ghost.reasons.slice(0, 3).map((reason) => (
              <p key={reason.code} className="text-caption text-fg-tertiary">
                {reason.message}
              </p>
            ))}
          </div>
        )}
        <p className="mt-2.5 text-caption text-fg-tertiary">
          Open the listing for the full breakdown.
        </p>
      </PopoverContent>
    </Popover>
  );
}
