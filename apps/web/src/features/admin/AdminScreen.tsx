import {
  CircleCheck,
  CircleDashed,
  CircleX,
  Compass,
  Clock,
  RotateCw,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { animate, m, useMotionValue, useTransform } from 'motion/react';
import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router';

import { useAdminOverview } from '@/api/admin';
import { isAdmin, useMe } from '@/api/me';
import type { AdminOverview, AdminSourceRun } from '@/api/types';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  EmptyState,
  formatAbsolute,
  formatRelative,
  PageHeader,
  Skeleton,
  TableSkeleton,
  tweens,
  useNow,
  usePrefersReducedMotion,
} from '@kestrel/ui';

const nf = new Intl.NumberFormat('en-IN');
const fmt = (n: number | null | undefined) => (n == null ? '—' : nf.format(n));

/** Count up from 0 on first view (MOTION §5.8, `tweens.count`); later changes retarget; RM: instant. */
function StatNumber({ value }: { value: number }) {
  const reduced = usePrefersReducedMotion();
  const mv = useMotionValue(reduced ? value : 0);
  const text = useTransform(mv, (v) => nf.format(Math.round(v)));
  useEffect(() => {
    if (reduced) {
      mv.set(value);
      return undefined;
    }
    const controls = animate(mv, value, tweens.count);
    return () => controls.stop();
  }, [value, reduced, mv]);
  return <m.span>{text}</m.span>;
}

function StatTile({ label, value, children, testId }: { label: string; value: ReactNode; children?: ReactNode; testId: string }) {
  return (
    <section
      data-testid={testId}
      aria-label={label}
      className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface-raised p-4"
    >
      <h2 className="text-label uppercase text-fg-tertiary">{label}</h2>
      <p className="font-mono text-mono-lg tabular-nums text-fg">{value}</p>
      {children && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-fg-secondary">{children}</div>}
    </section>
  );
}

const HEALTH: { key: keyof AdminOverview['sources']['byHealth']; label: string; dot: string }[] = [
  { key: 'healthy', label: 'healthy', dot: 'bg-success' },
  { key: 'degraded', label: 'slow', dot: 'bg-warning' },
  { key: 'failing', label: 'failing', dot: 'bg-danger' },
  { key: 'pending', label: 'checking', dot: 'bg-border-strong' },
];

const RUN_STATUS: Record<string, { label: string; icon: LucideIcon; tone: string }> = {
  ok: { label: 'OK', icon: CircleCheck, tone: 'text-success' },
  not_modified: { label: 'Unchanged', icon: CircleCheck, tone: 'text-fg-secondary' },
  error: { label: 'Failed', icon: CircleX, tone: 'text-danger' },
  deferred: { label: 'Deferred', icon: Clock, tone: 'text-warning' },
  skipped: { label: 'Skipped', icon: CircleDashed, tone: 'text-fg-tertiary' },
};

function Tiles({ data }: { data: AdminOverview }) {
  const { users, listings, sources, crawler } = data;
  const used = crawler.cloudUsedToday;
  const ratio = crawler.cap > 0 ? Math.min(1, used / crawler.cap) : 0;
  const meterTone = ratio >= 1 ? 'bg-danger' : ratio >= 0.8 ? 'bg-warning' : 'bg-fg-secondary';
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile testId="admin-stat-users" label="Users" value={<StatNumber value={users.total} />}>
        <span>+{fmt(users.newLast7d)} this week</span>
        <span>
          {fmt(users.withGoogle)} Google · {fmt(users.withPassword)} password
        </span>
      </StatTile>
      <StatTile testId="admin-stat-listings" label="Active listings" value={<StatNumber value={listings.active} />}>
        <span>{fmt(listings.total)} total</span>
        <span>{fmt(listings.archived)} archived</span>
      </StatTile>
      <StatTile testId="admin-stat-sources" label="Sources" value={<StatNumber value={sources.total} />}>
        {HEALTH.filter((h) => (sources.byHealth[h.key] ?? 0) > 0).map((h) => (
          <span key={h.key} className="inline-flex items-center gap-1.5">
            <span className={cn('size-1.5 rounded-full', h.dot)} aria-hidden="true" />
            <span className="font-mono tabular-nums">{fmt(sources.byHealth[h.key])}</span> {h.label}
          </span>
        ))}
      </StatTile>
      <StatTile
        testId="admin-stat-crawler"
        label="Crawler"
        value={crawler.backend === 'selfhosted' ? 'Self-hosted' : 'Cloud'}
      >
        <div className="flex w-full flex-col gap-1.5">
          <div
            role="meter"
            aria-label="Cloud crawl credits used today"
            aria-valuemin={0}
            aria-valuemax={crawler.cap}
            aria-valuenow={used}
            className="h-1 w-full overflow-hidden rounded-full bg-surface-sunken"
          >
            <div
              className={cn('h-full w-full origin-left rounded-full', meterTone)}
              style={{ transform: `scaleX(${ratio})` }}
            />
          </div>
          <span>
            <span className="font-mono tabular-nums">
              {fmt(used)} / {fmt(crawler.cap)}
            </span>{' '}
            credits today
            {crawler.selfHostedUsedToday > 0 ? ` · ${fmt(crawler.selfHostedUsedToday)} self-hosted` : ''}
          </span>
          {crawler.backendReason && <span className="text-caption text-fg-tertiary">{crawler.backendReason}</span>}
        </div>
      </StatTile>
    </div>
  );
}

function Panel({ title, children, meta }: { title: string; children: ReactNode; meta?: ReactNode }) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface-raised">
      <header className="flex items-baseline justify-between gap-3 border-b border-border-subtle px-4 py-3">
        <h2 className="text-h3 text-fg">{title}</h2>
        {meta && <span className="font-mono text-mono-sm text-fg-tertiary">{meta}</span>}
      </header>
      {children}
    </section>
  );
}

function QueueTable({ queues, error }: { queues: AdminOverview['queues']; error: string | null }) {
  if (error) {
    return (
      <p role="status" className="flex items-start gap-2 px-4 py-6 text-small text-warning">
        <TriangleAlert className="mt-px size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        Queue depths unavailable: {error}
      </p>
    );
  }
  if (!queues.length) {
    return <p className="px-4 py-8 text-center text-small text-fg-secondary">No queues reported. Is the worker running?</p>;
  }
  const max = Math.max(1, ...queues.map((q) => q.waiting + q.delayed));
  return (
    <Table data-testid="admin-queues">
      <TableCaption className="sr-only">Queue depth per worker queue</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Queue</TableHead>
          <TableHead scope="col" className="text-right">Waiting</TableHead>
          <TableHead scope="col" className="text-right">Active</TableHead>
          <TableHead scope="col" className="text-right">Delayed</TableHead>
          <TableHead scope="col" className="text-right">Failed</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {queues.map((q) => (
          <TableRow key={q.name}>
            <TableCell className="font-mono">
              <span className="flex items-center gap-3">
                <span className="w-24 shrink-0">{q.name}</span>
                <span className="hidden h-1 flex-1 overflow-hidden rounded-full bg-surface-sunken sm:block" aria-hidden="true">
                  <span
                    className="block h-full w-full origin-left rounded-full bg-fg-tertiary"
                    style={{ transform: `scaleX(${(q.waiting + q.delayed) / max})` }}
                  />
                </span>
              </span>
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">{fmt(q.waiting)}</TableCell>
            <TableCell className="text-right font-mono tabular-nums">{fmt(q.active)}</TableCell>
            <TableCell className="text-right font-mono tabular-nums">{fmt(q.delayed)}</TableCell>
            <TableCell className={cn('text-right font-mono tabular-nums', q.failed > 0 && 'text-danger')}>
              {fmt(q.failed)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function RunsTable({ runs, now }: { runs: AdminSourceRun[]; now: Date }) {
  if (!runs.length) {
    return (
      <p className="px-4 py-8 text-center text-small text-fg-secondary">
        No source runs yet. They appear here as the worker checks sources.
      </p>
    );
  }
  return (
    <Table data-testid="admin-runs">
      <TableCaption className="sr-only">Most recent source runs, newest first</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Source</TableHead>
          <TableHead scope="col">Status</TableHead>
          <TableHead scope="col" className="text-right">Found</TableHead>
          <TableHead scope="col" className="text-right">Took</TableHead>
          <TableHead scope="col" className="text-right">When</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run) => {
          const status = RUN_STATUS[run.status] ?? RUN_STATUS.skipped!;
          const Icon = status.icon;
          const at = run.finishedAt ?? run.startedAt;
          const firstError = run.errors[0];
          return (
            <TableRow key={run.id} className="align-top">
              <TableCell className="max-w-72">
                <span className="block truncate font-medium text-fg" title={run.sourceName}>
                  {run.sourceName}
                </span>
                <span className="font-mono text-mono-sm text-fg-tertiary">
                  {run.sourceKind} · {run.reason}
                  {run.creditsUsed > 0 ? ` · ${run.creditsUsed} cr` : ''}
                </span>
                {firstError && (
                  <span className="mt-0.5 block text-caption text-danger">
                    {firstError.message}
                    {run.errors.length > 1 ? ` (+${run.errors.length - 1} more)` : ''}
                  </span>
                )}
              </TableCell>
              <TableCell>
                <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', status.tone)}>
                  <Icon className="size-4" strokeWidth={1.5} aria-hidden="true" />
                  {status.label}
                </span>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {fmt(run.found)}
                {run.new > 0 && <span className="block text-mono-sm text-success">+{fmt(run.new)} new</span>}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {run.durationMs == null
                  ? '—'
                  : run.durationMs < 1000
                    ? `${run.durationMs} ms`
                    : `${(run.durationMs / 1000).toFixed(1)} s`}
              </TableCell>
              <TableCell className="text-right whitespace-nowrap">
                <time
                  dateTime={at.toISOString()}
                  title={formatAbsolute(at)}
                  className="font-mono text-mono-sm text-fg-tertiary"
                >
                  {formatRelative(at, now)}
                </time>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-6" data-testid="admin-loading">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-3 rounded-lg border border-border bg-surface-raised p-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <TableSkeleton rows={6} columns={5} className="rounded-lg border border-border bg-surface-raised" />
        <TableSkeleton rows={6} columns={5} className="rounded-lg border border-border bg-surface-raised" />
      </div>
    </div>
  );
}

/** Non-admins see the same calm 404 as an unknown address: the page's existence isn't advertised. */
function NotForYou() {
  return (
    <div data-testid="not-found-page" className="grid min-h-[60dvh] place-items-center">
      <EmptyState
        variant="page"
        icon={Compass}
        title="Nothing at this address."
        body="The link may be old. Your radar has everything that's still open."
        action={
          <Button asChild variant="primary" size="lg">
            <Link to="/radar">Go to Radar</Link>
          </Button>
        }
      />
    </div>
  );
}

/** `/admin`: compact ops dashboard over `GET /v1/admin/overview` (role `admin`). */
export function Component() {
  const { data: me } = useMe();
  const admin = isAdmin(me);
  const overview = useAdminOverview({ enabled: admin });
  const now = useNow(15_000);
  if (!admin) return <NotForYou />;

  const { data, isPending, isError, error, isFetching, refetch, dataUpdatedAt } = overview;
  const updated = dataUpdatedAt ? formatRelative(new Date(dataUpdatedAt), now) : null;

  return (
    <div data-testid="admin-page" className="flex flex-col pb-10">
      <PageHeader
        title="Admin"
        meta={updated ? `Updated ${updated}` : undefined}
        actions={
          <Button size="sm" onClick={() => void refetch()} disabled={isFetching} aria-label="Refresh overview">
            <RotateCw className={cn(isFetching && 'animate-spin')} strokeWidth={1.5} />
            Refresh
          </Button>
        }
      />
      <div className="flex flex-col gap-6 px-gutter">
        {isError && data && (
          <p role="status" className="flex items-center gap-2 rounded-md bg-warning-subtle px-3 py-2 text-small text-warning">
            <TriangleAlert className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            Couldn't refresh. Showing numbers from {formatAbsolute(new Date(dataUpdatedAt))}.
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void refetch()}>
              Retry
            </Button>
          </p>
        )}
        {isPending ? (
          <LoadingState />
        ) : isError && !data ? (
          <div role="alert" data-testid="admin-error" className="flex flex-col items-center gap-3 py-16 text-center">
            <h2 className="text-h2 text-fg">Couldn't load the overview.</h2>
            <p className="max-w-prose text-body text-fg-secondary">{errorMessage(error)}</p>
            <Button variant="primary" onClick={() => void refetch()}>
              <RotateCw strokeWidth={1.5} /> Retry
            </Button>
          </div>
        ) : data ? (
          <>
            <Tiles data={data} />
            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <Panel title="Queues" meta={`${data.queues.length} queues`}>
                <QueueTable queues={data.queues} error={data.queuesError} />
              </Panel>
              <Panel title="Recent source runs" meta={data.recentRuns.length ? `last ${data.recentRuns.length}` : undefined}>
                <RunsTable runs={data.recentRuns} now={now} />
              </Panel>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
