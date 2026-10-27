import { CompanyLogo, Skeleton, springs, tweens, variants } from '@kestrel/ui';
import { CircleAlert, CircleCheck, CornerDownRight, Globe, RotateCw } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';

import { resultSummary, type DetectState } from '../lib/detect-machine';
import { KIND_ICONS } from '../lib/kind-icons';
import { displayUrl } from '../lib/rows';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Detection result region (DESIGN §10.5, copy #9/#10): detecting shimmer → animated reveal of the
 * result line ("Detected: Greenhouse board `stripe` → 142 jobs") + 3 preview rows, or the crawler
 * fallback, or an error with the fix. Announced politely.
 */
export function DetectPanel({
  state,
  creditsPerDay,
  creditsPaused,
  onRetry,
  onShowExisting,
}: {
  state: DetectState;
  creditsPerDay: number;
  creditsPaused: boolean;
  onRetry: () => void;
  onShowExisting?: (id: string) => void;
}) {
  const key = state.status === 'typing' || state.status === 'idle' ? 'none' : state.status;
  return (
    <div data-testid="sources-detect-result" data-status={state.status} aria-live="polite" className="min-h-6">
      <AnimatePresence mode="popLayout" initial={false}>
        {key === 'none' ? null : (
          <m.div
            key={key}
            layout="position"
            variants={variants.fade}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex flex-col gap-2"
          >
            {state.status === 'detecting' ? <Detecting /> : null}
            {state.status === 'detected' || state.status === 'crawl' ? (
              <Result state={state} creditsPerDay={creditsPerDay} creditsPaused={creditsPaused} />
            ) : null}
            {state.status === 'error' ? (
              <div className="flex flex-col gap-2">
                <p data-testid="source-detect-result" className="flex items-start gap-2 text-small text-danger">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                  <span>{state.error.message}</span>
                </p>
                <div className="flex gap-2 pl-6">
                  {state.error.kind === 'duplicate' && state.error.existingId && onShowExisting ? (
                    <Button size="xs" variant="secondary" onClick={() => onShowExisting(state.error.existingId!)}>
                      Show it
                    </Button>
                  ) : null}
                  {state.error.kind === 'unreachable' || state.error.kind === 'rate-limited' || state.error.kind === 'unknown' ? (
                    <Button size="xs" variant="ghost" onClick={onRetry}>
                      <RotateCw strokeWidth={1.5} /> Try again
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Detecting() {
  return (
    <div className="flex flex-col gap-2">
      <p data-testid="source-detect-result" className="flex items-center gap-2 font-mono text-mono-sm text-fg-secondary">
        <span className="relative inline-flex size-4 items-center justify-center" aria-hidden="true">
          <span className="size-3 rounded-full border-[1.5px] border-fg-tertiary border-t-transparent motion-safe:animate-spin" />
        </span>
        Detecting…
      </p>
      <div className="flex flex-col gap-1.5 pl-6" aria-hidden="true">
        {[0.6, 0.45, 0.52].map((w, i) => (
          <div key={i} className="flex h-6 items-center gap-2">
            <Skeleton className="size-4 rounded-xs" />
            <Skeleton className="h-3" style={{ width: `${w * 100}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Result({
  state,
  creditsPerDay,
  creditsPaused,
}: {
  state: Extract<DetectState, { status: 'detected' | 'crawl' }>;
  creditsPerDay: number;
  creditsPaused: boolean;
}) {
  const { result, redirectedTo } = state;
  const { kindLabel, token, count } = resultSummary(result);
  const KindIcon = KIND_ICONS[result.kind];
  const crawl = state.status === 'crawl';
  return (
    <div className="flex flex-col gap-2">
      <p data-testid="source-detect-result" className={cn('flex items-start gap-2 text-small', crawl ? 'text-fg' : 'text-fg')}>
        <m.span
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1, transition: springs.snappy }}
          className="mt-0.5 shrink-0"
          aria-hidden="true"
        >
          {crawl ? (
            <Globe className="size-4 text-fg-secondary" strokeWidth={1.5} />
          ) : (
            <CircleCheck className="size-4 text-success" strokeWidth={1.5} />
          )}
        </m.span>
        {crawl ? (
          <span>
            No job board API here. We’ll crawl this page; uses ~<span className="font-mono">{creditsPerDay}</span>{' '}
            {creditsPerDay === 1 ? 'credit' : 'credits'}/day.
          </span>
        ) : (
          <span className="font-mono text-mono-sm">
            Detected: <KindIcon className="mb-0.5 inline size-3.5 text-fg-secondary" strokeWidth={1.5} aria-hidden="true" />{' '}
            {kindLabel} board {token ? <code className="rounded-xs bg-surface-sunken px-1 text-fg">{token}</code> : null}
            {count ? <> · {count}</> : null}
          </span>
        )}
      </p>
      {redirectedTo ? (
        <p className="flex items-center gap-1.5 pl-6 text-caption text-fg-secondary">
          <CornerDownRight className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          Redirects to <span className="font-mono">{displayUrl(redirectedTo)}</span>; Beacon will watch that page.
        </p>
      ) : null}
      {crawl && creditsPaused ? (
        <p className="pl-6 text-caption text-warning">
          Today’s crawl budget is used up. This page will first be read after 00:00 IST.
        </p>
      ) : null}
      {result.sampleTitles.length > 0 ? (
        <ul className="flex flex-col gap-0.5 pl-6" aria-label="Preview">
          {result.sampleTitles.slice(0, 3).map((title, i) => (
            <m.li
              key={title}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0, transition: { ...springs.gentle, delay: 0.04 * (i + 1) } }}
              exit={{ opacity: 0, transition: tweens.exit }}
              className="flex h-6 items-center gap-2 text-small text-fg-secondary"
            >
              <CompanyLogo name={result.companyName ?? result.name ?? '?'} domain={result.companyDomain} size={20} />
              <span className="truncate">{title}</span>
            </m.li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
