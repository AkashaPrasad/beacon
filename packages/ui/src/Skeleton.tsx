import type { ComponentProps } from 'react';

import { cn } from './cn';
import { useDelayedTrue } from './hooks';

/** Base skeleton block: `surface-sunken` with the `skeleton-shine` shimmer (static under reduced motion). */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('skeleton-shimmer rounded-xs bg-surface-sunken', className)}
      {...props}
    />
  );
}

interface SkeletonGroupProps extends ComponentProps<'div'> {
  /** Accessible loading label (announced once via role=status). */
  label?: string;
  /** Delay before anything renders, so fast loads never flash (DESIGN §6.1: 150 ms). */
  delayMs?: number;
}

function SkeletonGroup({
  label = 'Loading',
  delayMs = 150,
  className,
  children,
  ...props
}: SkeletonGroupProps) {
  const visible = useDelayedTrue(delayMs);
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className} {...props}>
      <span className="sr-only">{label}</span>
      {visible ? children : null}
    </div>
  );
}

/** Rows matching `RadarRow` geometry exactly: logo square, two bars (60 % / 40 %), deadline, ring. */
export function ListSkeleton({ rows = 8, ...props }: SkeletonGroupProps & { rows?: number }) {
  return (
    <SkeletonGroup label="Loading listings" {...props}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-row items-center gap-3 border-b border-border-subtle px-4">
          <Skeleton className="size-7 shrink-0 rounded-sm compact:size-5" />
          <div className="flex min-w-0 flex-1 flex-col gap-2 compact:flex-row compact:items-center">
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="h-3 w-2/5 compact:hidden" />
          </div>
          <Skeleton className="hidden h-3 w-12 sm:block" />
          <Skeleton className="size-7 shrink-0 rounded-full compact:size-6" />
        </div>
      ))}
    </SkeletonGroup>
  );
}

/** Kanban/tracker-sized card. */
export function CardSkeleton({
  count = 3,
  className,
  ...props
}: SkeletonGroupProps & { count?: number }) {
  return (
    <SkeletonGroup label="Loading" className={cn('flex flex-col gap-2', className)} {...props}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-md border border-border bg-surface-raised p-card"
        >
          <div className="flex items-center gap-2">
            <Skeleton className="size-5 rounded-sm" />
            <Skeleton className="h-3.5 w-3/5" />
          </div>
          <Skeleton className="h-3 w-2/5" />
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="size-6 rounded-full" />
          </div>
        </div>
      ))}
    </SkeletonGroup>
  );
}

/** Table rows at `h-row-table`. */
export function TableSkeleton({
  rows = 6,
  columns = 5,
  className,
  ...props
}: SkeletonGroupProps & { rows?: number; columns?: number }) {
  const widths = ['w-3/4', 'w-1/2', 'w-2/3', 'w-1/3', 'w-5/12'];
  return (
    <SkeletonGroup label="Loading table" className={cn('w-full', className)} {...props}>
      {Array.from({ length: rows }, (_, r) => (
        <div
          key={r}
          className="flex h-row-table items-center gap-4 border-b border-border-subtle px-cell"
        >
          {Array.from({ length: columns }, (_, c) => (
            <div key={c} className="flex-1">
              <Skeleton className={cn('h-3', widths[(r + c) % widths.length])} />
            </div>
          ))}
        </div>
      ))}
    </SkeletonGroup>
  );
}
