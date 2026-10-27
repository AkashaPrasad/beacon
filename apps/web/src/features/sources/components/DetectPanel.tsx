import { CircleAlert, CircleCheck, CornerDownRight, Globe, Info, RotateCw } from 'lucide-react';
import { AnimatePresence, m, useIsPresent } from 'motion/react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { CompanyLogo, Skeleton, springs, tweens, variants } from '@kestrel/ui';

import { resultSummary, type DetectState } from '../lib/detect-machine';
import { KIND_ICONS } from '../lib/kind-icons';
import { displayUrl } from '../lib/rows';


/**
 * Detection result region (DESIGN §10.5, copy #9/#10): detecting shimmer → animated reveal of the
 * result line ("Detected: Greenhouse board `stripe` → 142 jobs") + 3 preview rows, or the crawler
 * fallback, or an error with the fix. Announced politely.
 */
export function DetectPanel({
  state,
  creditsPerDay,
  creditsPaused,
  duplicate = null,
  onRetry,
  onShowExisting,
}: {
  state: DetectState;
  creditsPerDay: number;
  creditsPaused: boolean;
  /** A personal source with the same normalised URL (a hint; the server decides on submit). */
  duplicate?: { id: string; name: string } | null;
  onRetry: () => void;
  onShowExisting?: (id: string) => void;
}) {
  const key = state.status === 'typing' || state.status === 'idle' ? 'none' : state.status;
  return (
    <div
      data-testid="sources-detect-result"
      data-status={state.status}
      aria-live="polite"
      className="min-h-6"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {key === 'none' ? null : (
          <PanelItem key={key}>
            {state.status === 'detecting' ? <Detecting /> : null}
            {state.status === 'detected' || state.status === 'crawl' ? (
              <Result
                state={state}
                creditsPerDay={creditsPerDay}
                creditsPaused={creditsPaused}
                duplicate={duplicate}
                onShowExisting={onShowExisting}
              />
            ) : null}
            {state.status === 'error' ? (
              <ErrorLine error={state.error} onRetry={onRetry} onShowExisting={onShowExisting} />
            ) : null}
          </PanelItem>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * One state of the panel. While a state animates out (`popLayout` keeps it for 120 ms) it is inert
 * and hidden from assistive tech, and drops the line testid, so there is only ever one current line.
 */
function PanelItem({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  return (
    <m.div
      layout="position"
      variants={variants.fade}
      initial="hidden"
      animate="visible"
      exit="exit"
      aria-hidden={present ? undefined : true}
      inert={!present}
      className="flex flex-col gap-2"
    >
      {children}
    </m.div>
  );
}

function useLineTestId(): string | undefined {
  return useIsPresent() ? 'source-detect-result' : undefined;
}

function ErrorLine({
  error,
  onRetry,
  onShowExisting,
}: {
  error: Extract<DetectState, { status: 'error' }>['error'];
  onRetry: () => void;
  onShowExisting?: (id: string) => void;
}) {
  const testId = useLineTestId();
  const existingId = error.kind === 'duplicate' ? error.existingId : undefined;
  return (
    <div className="flex flex-col gap-2">
      <p data-testid={testId} className="flex items-start gap-2 text-small text-danger">
        <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        <span>{error.message}</span>
      </p>
      <div className="flex gap-2 pl-6">
        {existingId && onShowExisting ? (
          <Button size="xs" variant="secondary" onClick={() => onShowExisting(existingId)}>
            Show it
          </Button>
        ) : null}
        {error.kind === 'unreachable' || error.kind === 'rate-limited' || error.kind === 'unknown' ? (
          <Button size="xs" variant="ghost" onClick={onRetry}>
            <RotateCw strokeWidth={1.5} /> Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Detecting() {
  const testId = useLineTestId();
  return (
    <div className="flex flex-col gap-2">
      <p
        data-testid={testId}
        className="flex items-center gap-2 font-mono text-mono-sm text-fg-secondary"
      >
        <span
          className="relative inline-flex size-4 items-center justify-center"
          aria-hidden="true"
        >
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
  duplicate,
  onShowExisting,
}: {
  state: Extract<DetectState, { status: 'detected' | 'crawl' }>;
  creditsPerDay: number;
  creditsPaused: boolean;
  duplicate: { id: string; name: string } | null;
  onShowExisting?: (id: string) => void;
}) {
  const testId = useLineTestId();
  const { result, redirectedTo } = state;
  const { kindLabel, token, count } = resultSummary(result);
  const KindIcon = KIND_ICONS[result.kind];
  const crawl = state.status === 'crawl';
  return (
    <div className="flex flex-col gap-2">
      <p data-testid={testId} className="flex items-start gap-2 text-small text-fg">
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
            No job board API here. We’ll read the page instead (uses about{' '}
            <span className="font-mono">{creditsPerDay}</span> crawl{' '}
            {creditsPerDay === 1 ? 'credit' : 'credits'} a day).
          </span>
        ) : (
          <span className="font-mono text-mono-sm">
            Detected:{' '}
            <KindIcon
              className="mb-0.5 inline size-3.5 text-fg-secondary"
              strokeWidth={1.5}
              aria-hidden="true"
            />{' '}
            {kindLabel} board{' '}
            {token ? (
              <code className="rounded-xs bg-surface-sunken px-1 text-fg">{token}</code>
            ) : null}
            {count ? <> → {count}</> : null}
          </span>
        )}
      </p>
      {redirectedTo ? (
        <p className="flex items-center gap-1.5 pl-6 text-caption text-fg-secondary">
          <CornerDownRight className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          Redirects to <span className="font-mono">{displayUrl(redirectedTo)}</span>; Beacon will
          watch that page.
        </p>
      ) : null}
      {duplicate ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-6 text-caption text-fg-secondary">
          <Info className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          <span>
            You already watch this page as “{duplicate.name}”.
          </span>
          {onShowExisting ? (
            <button
              type="button"
              onClick={() => onShowExisting(duplicate.id)}
              className="rounded-xs text-accent-strong underline-offset-3 hover:underline focus-visible:focus-ring"
            >
              Show it
            </button>
          ) : null}
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
              animate={{
                opacity: 1,
                y: 0,
                transition: { ...springs.gentle, delay: 0.04 * (i + 1) },
              }}
              exit={{ opacity: 0, transition: tweens.exit }}
              className="flex h-6 items-center gap-2 text-small text-fg-secondary"
            >
              <CompanyLogo
                name={result.companyName ?? result.name ?? '?'}
                domain={result.companyDomain}
                size={20}
              />
              <span className="truncate">{title}</span>
            </m.li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
