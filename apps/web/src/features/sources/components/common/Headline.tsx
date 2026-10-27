import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * The one sentence a page opens with (UX restructure §1.2: "one glance → one decision"), e.g.
 * "You're watching 42 sources. 2 need a look." Numbers inside use <HeadlineNumber>. While the data
 * loads, a shimmer bar holds the same line box, so nothing jumps when the sentence lands.
 */
export function Headline({
  loading,
  children,
  className,
  testId,
}: {
  loading?: boolean;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <p
      data-testid={testId}
      aria-live="polite"
      className={cn('min-h-6 px-gutter text-body-lg text-pretty text-fg-secondary', className)}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="skeleton-shimmer inline-block h-4 w-72 max-w-full rounded-xs bg-surface-sunken align-middle"
        />
      ) : (
        children
      )}
    </p>
  );
}

/** A number inside a headline: mono, tabular, full-strength colour. */
export function HeadlineNumber({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: 'warning' | 'danger';
}) {
  return (
    <span
      className={cn(
        'font-mono font-medium tabular-nums',
        tone === 'warning' ? 'text-warning' : tone === 'danger' ? 'text-danger' : 'text-fg',
      )}
    >
      {children}
    </span>
  );
}

/** Shared page introduction: a clear title, summary and optional contextual status. */
export function ListHeadline({
  title,
  line,
  aside,
  loading,
  testId,
}: {
  title: ReactNode;
  line?: ReactNode;
  aside?: ReactNode;
  loading?: boolean;
  testId?: string;
}) {
  return (
    <header
      data-testid={testId}
      className="flex flex-wrap items-start justify-between gap-4 px-gutter pt-7 pb-6"
    >
      <div className="min-w-0 flex-1" aria-live="polite" aria-busy={loading}>
        <h1 className="font-display text-h1 text-balance text-fg">
          {loading ? (
            <span
              className="skeleton-shimmer inline-block h-8 w-72 max-w-full rounded-sm bg-surface-sunken"
              aria-label="Loading sources"
            />
          ) : (
            title
          )}
        </h1>
        {!loading && line && <p className="mt-2 text-small text-fg-secondary">{line}</p>}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </header>
  );
}
