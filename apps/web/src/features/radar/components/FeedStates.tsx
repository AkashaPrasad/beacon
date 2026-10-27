/**
 * Honest states for the radar (DESIGN §1 principle 5, §8 copy, USERFLOW §1.7, §3.1, §6):
 * since-last-visit strip, warming-up strip, empty variants with a next action, error with retry,
 * stale-results strip and skeleton rows (150 ms delay, ≥ 300 ms once shown, crossfade).
 */
import { EmptyState, formatShortDate, ListSkeleton, tweens, variants } from '@kestrel/ui';
import { AlertCircle, CircleCheck, CircleDashed, Radar, RotateCw, SearchX, SlidersHorizontal, X } from 'lucide-react';
import { m } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

import { formatCount } from '../lib/format';
import { SKELETON_DELAY_MS, SKELETON_MIN_MS } from '../lib/motion';

import type { FeedSummary } from '@/api/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ── Skeleton gate (MOTION §5.7) ──────────────────────────────────────────────

/** True while the skeleton should be visible: after 150 ms of loading, and for at least 300 ms. */
export function useSkeletonGate(loading: boolean): boolean {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);
  useEffect(() => {
    if (loading) {
      const t = setTimeout(() => {
        shownAt.current = performance.now();
        setVisible(true);
      }, SKELETON_DELAY_MS);
      return () => clearTimeout(t);
    }
    const remaining = Math.max(0, SKELETON_MIN_MS - (performance.now() - shownAt.current));
    const t = setTimeout(() => setVisible(false), remaining);
    return () => clearTimeout(t);
  }, [loading]);
  return visible;
}

export function FeedSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <m.div key="skeleton" initial={{ opacity: 1 }} exit={{ opacity: 0, transition: tweens.fadeOut }}>
      <ListSkeleton rows={rows} delayMs={0} data-testid="radar-skeleton" />
    </m.div>
  );
}

// ── Since last visit (DESIGN §6.2, USERFLOW §3.1) ────────────────────────────

const DISMISS_KEY = 'beacon:radar:summary-dismissed';
const DAY = 86_400_000;

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

export function useSummaryDismissal(lastSeenFeedAt: Date | null) {
  const marker = lastSeenFeedAt ? lastSeenFeedAt.toISOString() : null;
  const [dismissed, setDismissed] = useState(() => readDismissed());
  return {
    dismissed: marker != null && dismissed === marker,
    dismiss: () => {
      if (!marker) return;
      try {
        localStorage.setItem(DISMISS_KEY, marker);
      } catch {
        // ignore: the strip just reappears next visit
      }
      setDismissed(marker);
    },
  };
}

export function SummaryStrip({
  summary,
  nowMs,
  onShowNew,
  onDismiss,
}: {
  summary: FeedSummary;
  nowMs: number;
  onShowNew: () => void;
  onDismiss: () => void;
}) {
  const since = summary.lastSeenFeedAt;
  if (!since) return null;
  const awayDays = Math.floor((nowMs - since.getTime()) / DAY);
  const weeks = Math.max(2, Math.round(awayDays / 7));
  return (
    <m.div
      data-testid="radar-summary"
      role="status"
      variants={variants.row}
      initial="hidden"
      animate="visible"
      className="flex min-h-9 items-center gap-2 border-b border-border-subtle bg-surface-sunken px-gutter py-1.5 text-small text-fg-secondary"
    >
      <p className="min-w-0 flex-1 truncate">
        {awayDays >= 14 ? (
          <>
            Welcome back. In {weeks} weeks: <strong className="font-mono font-medium text-fg">{formatCount(summary.newSinceLastVisit)}</strong>{' '}
            new fits.
          </>
        ) : (
          <>
            Since {formatShortDate(since)}:{' '}
            <strong className="font-mono font-medium text-fg">{formatCount(summary.newSinceLastVisit)}</strong> new fits ·{' '}
            <strong className="font-mono font-medium text-fg">{formatCount(summary.deadlinesThisWeek)}</strong>{' '}
            {summary.deadlinesThisWeek === 1 ? 'deadline' : 'deadlines'} this week.
          </>
        )}
      </p>
      {summary.newSinceLastVisit > 0 && (
        <Button variant="ghost" size="xs" onClick={onShowNew} data-testid="radar-summary-show-new">
          Show new
        </Button>
      )}
      <button
        type="button"
        aria-label="Dismiss until next visit"
        onClick={onDismiss}
        className="grid size-6 place-items-center rounded-xs text-fg-tertiary hover:bg-surface-hover hover:text-fg focus-visible:focus-ring"
      >
        <X className="size-3.5" strokeWidth={1.5} />
      </button>
    </m.div>
  );
}

// ── Warming up (USERFLOW §1.7) ───────────────────────────────────────────────

export type WarmingPhase = 'warming' | 'ready';

export function WarmingStrip({
  phase,
  summary,
  slow,
  onDismiss,
}: {
  phase: WarmingPhase;
  summary: FeedSummary | undefined;
  slow: boolean;
  onDismiss: () => void;
}) {
  // `progress` is an additive field requested from the API (SHARED-REQUESTS "web → api").
  const progress = (summary as (FeedSummary & { progress?: { done: number; total: number } }) | undefined)?.progress;
  const fraction = progress && progress.total > 0 ? progress.done / progress.total : null;
  return (
    <div data-testid="radar-warming-strip" className="relative border-b border-border-subtle bg-surface-sunken">
      <m.div
        data-testid="radar-warming-up"
        data-phase={phase}
        variants={variants.fade}
        initial="hidden"
        animate="visible"
        className="flex min-h-11 items-start gap-2.5 px-gutter py-2.5 text-small text-fg-secondary"
      >
        {phase === 'ready' ? (
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={1.5} aria-hidden="true" />
        ) : (
          <CircleDashed className="mt-0.5 size-4 shrink-0 animate-spin text-fg-tertiary [animation-duration:2.4s] motion-reduce:animate-none" strokeWidth={1.5} aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1" aria-live="polite">
          {phase === 'ready' ? (
            <p>
              Radar ready: <strong className="font-mono font-medium text-fg">{formatCount(summary?.total ?? 0)}</strong> fits.
              Personal sources keep updating in the background.
            </p>
          ) : (
            <>
              <p>
                <strong className="font-medium text-fg">Your radar is warming up.</strong>{' '}
                {progress
                  ? `Ranking ${progress.done} of ${progress.total} packs — new fits appear here as each one finishes.`
                  : 'Checking your sources — new fits appear here as each one finishes.'}
              </p>
              <p className="mt-0.5 text-caption text-fg-tertiary">
                {slow
                  ? 'Taking longer than usual. You can keep browsing; rows will keep arriving.'
                  : 'While you wait: J and K move between rows, S saves, Enter opens the details.'}
              </p>
            </>
          )}
        </div>
        {phase === 'ready' && (
          <button
            type="button"
            aria-label="Dismiss"
            onClick={onDismiss}
            className="grid size-6 place-items-center rounded-xs text-fg-tertiary hover:bg-surface-hover hover:text-fg focus-visible:focus-ring"
          >
            <X className="size-3.5" strokeWidth={1.5} />
          </button>
        )}
      </m.div>
      {phase === 'warming' && (
        <div
          role="progressbar"
          aria-label="Ranking progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={fraction == null ? undefined : Math.round(fraction * 100)}
          className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-transparent"
        >
          {fraction != null && (
            <m.span
              className="block h-full origin-left bg-accent-strong"
              initial={false}
              animate={{ scaleX: Math.max(0.04, fraction) }}
              transition={tweens.count}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Empty states ─────────────────────────────────────────────────────────────

export type EmptyVariant = 'warming-up' | 'below-threshold' | 'filters' | 'none' | 'search';

export function FeedEmpty({
  variant,
  minFit,
  lowerTo,
  lowerCount,
  query,
  narrowDescription,
  clearLabel,
  onLower,
  onClearNarrowest,
  onReset,
  onSearchAllTypes,
}: {
  variant: EmptyVariant;
  minFit: number;
  lowerTo: number;
  lowerCount: number | null;
  query: string;
  narrowDescription: string;
  clearLabel: string | null;
  onLower: () => void;
  onClearNarrowest: () => void;
  onReset: () => void;
  onSearchAllTypes: () => void;
}) {
  const wrap = (children: React.ReactNode) => (
    <m.div data-testid="radar-empty" data-variant={variant} variants={variants.fade} initial="hidden" animate="visible">
      {children}
    </m.div>
  );
  switch (variant) {
    case 'warming-up':
      return wrap(
        <EmptyState
          icon={Radar}
          title="Your radar is warming up."
          body="Checking your sources — new fits appear here as each one finishes."
        />,
      );
    case 'below-threshold':
      return wrap(
        <EmptyState
          icon={SlidersHorizontal}
          title={`Nothing above ${minFit} right now.`}
          body={
            lowerCount != null && lowerCount > 0
              ? `${formatCount(lowerCount)} ${lowerCount === 1 ? 'listing scores' : 'listings score'} ${lowerTo}–${Math.max(lowerTo, minFit - 1)}.`
              : 'Lower the threshold to see more, or turn on another pack.'
          }
          action={
            <Button variant="primary" onClick={onLower} data-testid="radar-empty-lower">
              Lower to {lowerTo}
            </Button>
          }
          secondaryAction={
            <Button variant="ghost" asChild>
              <Link to="/sources">Enable a pack</Link>
            </Button>
          }
        />,
      );
    case 'search':
      return wrap(
        <EmptyState
          icon={SearchX}
          title={`No listings match “${query}”.`}
          body="Try fewer words, or search all types."
          action={
            <Button variant="secondary" onClick={onSearchAllTypes}>
              Search all types
            </Button>
          }
        />,
      );
    case 'filters':
      return wrap(
        <EmptyState
          icon={SlidersHorizontal}
          title="No listings match these filters."
          body={narrowDescription ? `${narrowDescription} is narrow.` : 'Try removing a filter.'}
          action={
            clearLabel ? (
              <Button variant="primary" onClick={onClearNarrowest} data-testid="radar-empty-clear">
                {clearLabel}
              </Button>
            ) : undefined
          }
          secondaryAction={
            <Button variant="ghost" onClick={onReset}>
              Reset filters
            </Button>
          }
        />,
      );
    case 'none':
      return wrap(
        <EmptyState
          icon={Radar}
          title="No open listings match your types and location yet."
          body="Widen your preferences or add a careers page to watch."
          action={
            <Button variant="primary" asChild>
              <Link to="/profile">Edit preferences</Link>
            </Button>
          }
          secondaryAction={
            <Button variant="ghost" asChild>
              <Link to="/sources">Add a source</Link>
            </Button>
          }
        />,
      );
  }
}

// ── Errors ───────────────────────────────────────────────────────────────────

export function FeedError({ message, onRetry, retrying }: { message: string; onRetry: () => void; retrying: boolean }) {
  return (
    <m.div data-testid="radar-error" role="alert" variants={variants.fade} initial="hidden" animate="visible">
      <EmptyState
        icon={AlertCircle}
        title="Couldn't load your radar."
        body={message || "The server didn't respond within 10 seconds."}
        action={
          <Button variant="primary" onClick={onRetry} disabled={retrying} data-testid="radar-error-retry">
            <RotateCw className={cn(retrying && 'animate-spin')} strokeWidth={1.5} aria-hidden="true" />
            Retry
          </Button>
        }
      />
    </m.div>
  );
}

export function StaleStrip({ updatedAt, onRetry }: { updatedAt: number; onRetry: () => void }) {
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(updatedAt);
  return (
    <div
      data-testid="radar-stale-strip"
      role="status"
      className="flex min-h-9 items-center gap-2 border-b border-border-subtle bg-warning-subtle px-gutter py-1.5 text-small text-warning"
    >
      <AlertCircle className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
      <p className="flex-1">Couldn&apos;t refresh. Showing results from {time}.</p>
      <Button variant="ghost" size="xs" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

/** "9 new fits · Show" pill: live inserts queue behind it once the user has scrolled or focused. */
export function NewFitsPill({ count, onShow }: { count: number; onShow: () => void }) {
  return (
    <m.div
      className="pointer-events-none absolute inset-x-0 top-2 z-sticky flex justify-center"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
    >
      <button
        type="button"
        data-testid="radar-new-pill"
        onClick={onShow}
        className="pointer-events-auto flex h-7 items-center gap-1.5 rounded-full border border-border bg-overlay px-3 text-small text-fg shadow-md hover:bg-surface-hover focus-visible:focus-ring"
      >
        <span className="font-mono font-medium">{formatCount(count)}</span> new {count === 1 ? 'fit' : 'fits'} ·
        <span className="font-medium text-accent-strong">Show</span>
      </button>
    </m.div>
  );
}
