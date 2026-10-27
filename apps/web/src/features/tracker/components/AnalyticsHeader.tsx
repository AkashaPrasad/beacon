import { ChevronDown } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useId, useState, type ReactNode } from 'react';

import type { TrackerAnalytics } from '@/api/types';
import { Button } from '@/components/ui/button';
import { CountUp } from '@/features/sources/components/common/CountUp';
import { readJson, writeJson } from '@/lib/storage';
import { Skeleton, springs, stagger, variants } from '@kestrel/ui';

import { analyticsView, type AnalyticsView } from '../lib/analytics';

const OPEN_KEY = 'beacon:tracker:stats-open';

/**
 * Analytics, folded to one calm line by default (UX restructure): "8 applied · heard back from 4
 * (50%) · usually in 11 days · See stats". "See stats" unfolds the full header (DESIGN §10.4): four
 * numbers in `mono-lg` that count up on first view, and the best-sources bar list with its numbers
 * as text. The choice is remembered on this device.
 */
export function AnalyticsHeader({
  analytics,
  loading,
}: {
  analytics: TrackerAnalytics | undefined;
  loading: boolean;
}) {
  const v = analyticsView(analytics);
  const [open, setOpenState] = useState(() => readJson<boolean>(OPEN_KEY, false));
  const panelId = useId();
  const setOpen = (next: boolean) => {
    setOpenState(next);
    writeJson(OPEN_KEY, next);
  };
  return (
    <section data-testid="tracker-analytics" aria-label="Application stats" aria-busy={loading || undefined} className="px-gutter pb-3">
      <div className="flex min-h-8 flex-wrap items-center gap-x-1 gap-y-1 text-small text-fg-secondary">
        {loading ? <Skeleton className="h-4 w-64" /> : <Summary v={v} />}
        <Button
          variant="ghost"
          size="sm"
          className="-ml-1"
          aria-expanded={open}
          aria-controls={panelId}
          data-testid="tracker-stats-toggle"
          onClick={() => setOpen(!open)}
        >
          {open ? 'Hide stats' : 'See stats'}
          <m.span animate={{ rotate: open ? 180 : 0 }} transition={springs.snappy} className="inline-flex">
            <ChevronDown strokeWidth={1.5} />
          </m.span>
        </Button>
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <m.div
            id={panelId}
            key="stats"
            variants={variants.fade}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="grid grid-cols-3 gap-x-4 gap-y-3 pt-2 sm:grid-cols-[repeat(3,minmax(0,auto))_minmax(0,1fr)] sm:gap-x-10"
          >
            <Stat label="Applied" loading={loading}>
              <CountUp value={v.applied} onceId="tracker-applied" />
            </Stat>
            <Stat
              label="Response rate"
              loading={loading}
              caption={v.note}
              hint={v.responseRatePct === null ? null : `${v.responded} of ${v.applied} heard back`}
            >
              {v.responseRatePct === null ? (
                <span aria-label="Not enough applications yet">—</span>
              ) : (
                <>
                  <CountUp value={v.responseRatePct} onceId="tracker-rate" />
                  <span className="text-fg-tertiary">%</span>
                </>
              )}
            </Stat>
            <Stat label="Median reply" loading={loading} caption={v.medianDays === null ? null : 'from applying to a reply'}>
              {v.medianDays === null ? (
                <span aria-label="No replies yet">—</span>
              ) : (
                <>
                  <CountUp value={v.medianDays} onceId="tracker-median" />
                  <span className="text-fg-tertiary">d</span>
                </>
              )}
            </Stat>
            <div className="col-span-3 flex min-w-0 flex-col gap-1 sm:col-span-1">
              <span className="text-label text-fg-tertiary uppercase">Best sources</span>
              <BestSources loading={loading} best={v.best} />
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

/** The folded line. Every number is also in the unfolded panel. */
function Summary({ v }: { v: AnalyticsView }) {
  if (v.applied === 0) {
    return <span>Nothing applied yet. Your stats start with the first application.</span>;
  }
  const n = (value: number) => <span className="font-mono text-mono text-fg">{value.toLocaleString('en-IN')}</span>;
  return (
    <p className="flex flex-wrap items-baseline gap-x-1.5">
      <span>{n(v.applied)} applied</span>
      <span aria-hidden="true">·</span>
      {v.responseRatePct === null ? (
        <span>reply rate shows after 3</span>
      ) : (
        <span>
          heard back from {n(v.responded)} ({n(v.responseRatePct)}%)
        </span>
      )}
      {v.medianDays !== null ? (
        <>
          <span aria-hidden="true">·</span>
          <span>usually in {n(v.medianDays)} days</span>
        </>
      ) : null}
    </p>
  );
}

function BestSources({ loading, best }: { loading: boolean; best: AnalyticsView['best'] }) {
  if (loading) return <Skeleton className="h-4 w-40" />;
  if (best.length === 0) return <span className="text-small text-fg-tertiary">Shows once replies come in.</span>;
  return (
    <ol className="flex max-w-sm flex-col gap-1" aria-label="Response rate by source">
      {best.map((s, i) => (
        <li key={s.id} className="grid grid-cols-[minmax(0,1fr)_auto_4rem] items-center gap-2 text-small">
          <span className="truncate text-fg-secondary" title={s.name}>
            {s.name}
          </span>
          <span className="font-mono text-mono-sm text-fg">
            {s.ratePct}%<span className="sr-only">, {s.responded} of {s.applied} replied</span>
          </span>
          <span className="h-1 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
            <m.span
              className={i === 0 ? 'block h-full origin-left rounded-full bg-fg' : 'block h-full origin-left rounded-full bg-fg-secondary'}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: Math.max(0.04, s.ratePct / 100) }}
              transition={{ ...springs.data, delay: stagger(i) ?? 0 }}
            />
          </span>
        </li>
      ))}
    </ol>
  );
}

function Stat({
  label,
  loading,
  hint,
  caption,
  children,
}: {
  label: string;
  loading: boolean;
  /** Extra context, read with the number. */
  hint?: string | null;
  /** Line under the number (e.g. why it shows "—"). */
  caption?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-label text-fg-tertiary uppercase">{label}</span>
      <span className="font-mono text-mono-lg whitespace-nowrap text-fg tabular-nums" title={hint ?? undefined}>
        {loading ? <Skeleton className="my-1.5 h-5 w-12" /> : children}
        {hint ? <span className="sr-only">, {hint}</span> : null}
      </span>
      {caption && !loading ? <span className="text-caption text-fg-tertiary">{caption}</span> : null}
    </div>
  );
}
