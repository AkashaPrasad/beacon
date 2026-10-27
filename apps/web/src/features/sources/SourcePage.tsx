import {
  ArrowUpRight,
  CircleCheck,
  CircleDashed,
  CirclePause,
  CircleX,
  MoreHorizontal,
  RefreshCw,
  Rss,
  SquareArrowOutUpRight,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { m } from 'motion/react';
import { useId, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import {
  useCommunitySources,
  useCredits,
  usePacks,
  useSource,
  useSourceListings,
  useSourceRuns,
  useSources,
  type SourceRunDTO,
} from '@/api/sources';
import { DetailPageHeader } from '@/components/detail-page-header';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { isApiError } from '@/lib/api';
import { useBackNavigation } from '@/lib/use-back-navigation';
import { cn } from '@/lib/utils';
import {
  OPPORTUNITY_TYPE_LABELS,
  OPPORTUNITY_TYPES,
  type OpportunityType,
  type RefreshInterval,
} from '@kestrel/shared';
import {
  CompanyLogo,
  EmptyState,
  FitRing,
  Skeleton,
  stagger,
  tweens,
  useNow,
  variants,
} from '@kestrel/ui';

import { CountUp } from './components/common/CountUp';
import { HealthBadge } from './components/HealthBadge';
import { KindBadge } from './components/KindBadge';
import { formatAbsolute, formatCount, formatRelative } from './lib/format';
import { meterState } from './lib/health';
import { packPath, SOURCES_PATH } from './lib/paths';
import {
  displayUrl,
  INTERVAL_OPTIONS,
  KIND_LABELS,
  sourceRowFrom,
  type SourceTableRow,
} from './lib/rows';
import { useSavedFlash } from './lib/use-saved';
import { useSourceActions } from './lib/use-source-actions';

const ANY = 'any';
const INTERVAL_MS: Record<RefreshInterval, number> = {
  '1h': 3_600_000,
  '6h': 6 * 3_600_000,
  daily: 86_400_000,
  weekly: 7 * 86_400_000,
};

/**
 * /sources/:id: one source as a full page (UX restructure §1.1, §2 Sources). Back · breadcrumb ·
 * name, then its health and why, the recent checks, what it found, and its settings (saved on
 * change): watching on/off, how often to check, how to tag listings, its name. Check now, open the
 * page, replace the URL and delete (with Undo) are one click away. Renders from the list caches, so
 * arriving from the list is instant; a cold link fetches `GET /v1/sources/:id`.
 */
export function Component() {
  const { id = '' } = useParams();
  const mine = useSources();
  const community = useCommunitySources();
  const packs = usePacks();
  const credits = useCredits();
  const listed = mine.data?.find((s) => s.id === id) ?? community.data?.find((s) => s.id === id);
  const fetched = useSource(id, { enabled: !listed && Boolean(id) });
  const source = listed ?? fetched.data;
  const mode = credits.data ? meterState(credits.data).mode : null;
  const row = source ? sourceRowFrom(source, packs.data ?? [], mode) : null;
  const notFound =
    !source &&
    !fetched.isPending &&
    (fetched.isError ? isApiError(fetched.error) && fetched.error.status === 404 : true) &&
    !mine.isPending &&
    !community.isPending;

  return (
    <div data-testid="source-page" className="mx-auto flex w-full max-w-5xl flex-col pb-16">
      {row && source ? (
        <SourceDetail row={row} createdAt={source.createdAt} />
      ) : (
        <>
          <DetailPageHeader
            parent={{ label: 'Sources', to: SOURCES_PATH }}
            title="Source"
            hideTitle={!notFound}
          />
          {notFound ? (
            <EmptyState
              variant="page"
              icon={Rss}
              title="This source isn’t here any more."
              body="It may have been deleted, or the link is from someone else’s account."
              action={
                <Button variant="secondary" asChild>
                  <Link to={SOURCES_PATH}>Back to sources</Link>
                </Button>
              }
            />
          ) : fetched.isError ? (
            <EmptyState
              variant="page"
              icon={Rss}
              title="Couldn't load this source."
              body="Check your connection and try again."
              action={
                <Button variant="secondary" onClick={() => void fetched.refetch()}>
                  Retry
                </Button>
              }
            />
          ) : (
            <SourcePageSkeleton />
          )}
        </>
      )}
    </div>
  );
}

/** Same boxes as the loaded page (header, health card, two columns), so nothing jumps. */
function SourcePageSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6 px-gutter pt-2">
      <span className="sr-only">Loading the source</span>
      <div className="flex items-center gap-4">
        <Skeleton className="size-10 rounded-sm" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-3.5 w-1/3" />
        </div>
      </div>
      <Skeleton className="h-20 w-full rounded-lg" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  aside,
  className,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn('flex flex-col gap-3', className)}>
      <div className="flex min-h-6 items-baseline justify-between gap-3">
        <h2 id={id} className="font-display text-h2 text-fg">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** A lifted panel (DESIGN §4.2 e2: raised surface, soft shadow, lighter top edge). */
function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('e2 rounded-lg border border-border-subtle', className)}>{children}</div>
  );
}

function SourceDetail({ row, createdAt }: { row: SourceTableRow; createdAt: Date | string }) {
  const navigate = useNavigate();
  const act = useSourceActions();
  const back = useBackNavigation(SOURCES_PATH);
  const now = useNow(30_000);
  const last = row.lastCheckedAt ? new Date(row.lastCheckedAt) : null;
  const next =
    last && row.enabled ? new Date(last.getTime() + INTERVAL_MS[row.refreshInterval]) : null;
  const canRefresh = row.editable || row.enabled;
  const replaceUrl = `${SOURCES_PATH}?add=${encodeURIComponent(row.url)}`;

  const remove = () => {
    act.remove(row);
    back();
  };

  return (
    <m.article
      aria-labelledby="source-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: tweens.fadeIn }}
      className="flex flex-col"
    >
      <DetailPageHeader
        parent={{ label: 'Sources', to: SOURCES_PATH }}
        trail={[
          ...(row.packId && !row.editable
            ? [{ label: row.packName ?? 'Pack', to: packPath(row.packId) }]
            : []),
          row.name,
        ]}
        titleId="source-title"
        title={row.name}
        actions={
          <>
            {canRefresh ? (
              <Button
                variant="secondary"
                data-testid="source-refresh"
                onClick={() => act.refresh(row)}
                disabled={row.status === 'pending' || row.optimistic}
              >
                <RefreshCw
                  strokeWidth={1.5}
                  className={cn(row.status === 'pending' && 'motion-safe:animate-spin')}
                />
                <span className="max-sm:sr-only">
                  {row.status === 'pending' ? 'Checking…' : 'Refresh now'}
                </span>
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={`More for ${row.name}`}>
                  <MoreHorizontal strokeWidth={1.5} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem asChild>
                  <a href={row.url} target="_blank" rel="noreferrer noopener">
                    <SquareArrowOutUpRight strokeWidth={1.5} /> Open the page
                  </a>
                </DropdownMenuItem>
                {row.packId && !row.editable ? (
                  <DropdownMenuItem onSelect={() => void navigate(packPath(row.packId ?? ''))}>
                    <Rss strokeWidth={1.5} /> Show its pack
                  </DropdownMenuItem>
                ) : null}
                {row.editable ? (
                  <>
                    <DropdownMenuItem onSelect={() => void navigate(replaceUrl)}>
                      <ArrowUpRight strokeWidth={1.5} /> Replace the URL
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="danger" onSelect={remove}>
                      <Trash2 strokeWidth={1.5} /> Delete source
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-gutter pb-6">
        <CompanyLogo name={row.name} domain={row.domain} size={20} />
        <a
          href={row.url}
          target="_blank"
          rel="noreferrer noopener"
          className="group/url inline-flex min-w-0 max-w-full items-center gap-1 rounded-xs font-mono text-mono-sm text-fg-secondary hover:text-fg focus-visible:focus-ring"
        >
          <span className="truncate">{displayUrl(row.url)}</span>
          <ArrowUpRight
            className="size-3.5 shrink-0 transition-transform duration-fast group-hover/url:translate-x-px group-hover/url:-translate-y-px"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
        <KindBadge kind={row.kind} />
        <span className="text-small text-fg-tertiary">
          {row.kind === 'firecrawl' ? 'Uses crawl credits' : 'Free to read'}
        </span>
      </div>

      <div className="grid gap-x-8 gap-y-8 px-gutter lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <HealthCard row={row} onRetry={() => act.refresh(row)} replaceUrl={replaceUrl} />
          <RecentChecks id={row.id} kind={row.kind} />
          <LatestListings id={row.id} found={row.listingsFound} />
        </div>

        <aside aria-label="About this source" className="flex flex-col gap-6">
          <Panel className="p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-label text-fg-tertiary uppercase">Listings found</p>
                <CountUp
                  value={row.listingsFound}
                  className="text-mono-lg text-fg"
                  onceId={`source-${row.id}`}
                />
              </div>
              <HealthBadge status={row.status} reason={row.reason} />
            </div>
            <dl className="mt-3 flex flex-col divide-y divide-border-subtle border-t border-border-subtle">
              <Fact label="Last check">
                {last ? (
                  <span className="font-mono text-mono" title={formatAbsolute(last)}>
                    {formatRelative(last, now)}
                  </span>
                ) : row.status === 'pending' ? (
                  'Checking for the first time…'
                ) : (
                  'Not checked yet'
                )}
              </Fact>
              <Fact label="Next check">
                {!row.enabled ? (
                  <span className="text-fg-secondary">Paused</span>
                ) : next ? (
                  <span className="font-mono text-mono" title={formatAbsolute(next)}>
                    {next.getTime() <= now.getTime() ? 'Due now' : formatRelative(next, now)}
                  </span>
                ) : (
                  <span className="text-fg-secondary">Right after the first check</span>
                )}
              </Fact>
              <Fact label="Added">
                <span className="text-small">{formatAbsolute(createdAt)}</span>
              </Fact>
            </dl>
          </Panel>

          <Section title="Settings">
            {row.editable ? (
              <SourceSettings row={row} />
            ) : (
              <Panel className="p-4">
                <p className="text-small text-fg-secondary">
                  Shared through{' '}
                  {row.packId ? (
                    <Link
                      to={packPath(row.packId)}
                      className="rounded-xs text-accent-strong underline-offset-3 hover:underline focus-visible:focus-ring"
                    >
                      {row.packName ?? 'its pack'}
                    </Link>
                  ) : (
                    'a pack'
                  )}
                  . Packs refresh on their own schedule for everyone, so there is nothing to set
                  here and it never uses your crawl budget.
                </p>
              </Panel>
            )}
          </Section>

          {row.editable ? (
            <div className="flex flex-col gap-2 rounded-lg border border-danger/25 p-4">
              <p className="text-small text-fg-secondary">
                Stop watching this page. Listings it already found stay in your tracker.
              </p>
              <Button
                variant="ghost"
                data-testid="source-delete"
                className="self-start text-danger hover:text-danger"
                onClick={remove}
              >
                <Trash2 strokeWidth={1.5} /> Delete source
              </Button>
            </div>
          ) : null}
        </aside>
      </div>
    </m.article>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-10 items-baseline justify-between gap-4 py-2">
      <dt className="text-small text-fg-secondary">{label}</dt>
      <dd className="min-w-0 text-right text-body text-fg">{children}</dd>
    </div>
  );
}

function HealthCard({
  row,
  onRetry,
  replaceUrl,
}: {
  row: SourceTableRow;
  onRetry: () => void;
  replaceUrl: string;
}) {
  const tone =
    row.status === 'error'
      ? 'border-danger/35 bg-danger-subtle'
      : row.status === 'paused' || row.status === 'warning'
        ? 'border-warning/35 bg-warning-subtle'
        : 'e2 border-border-subtle';
  return (
    <div
      data-testid="source-health"
      data-status={row.status}
      className={cn('flex flex-col gap-1 rounded-lg border px-4 py-3', tone)}
    >
      <HealthBadge
        status={row.status}
        reason={row.reason}
        interactive={false}
        className="text-body font-medium"
      />
      <p className="text-small text-pretty text-fg-secondary">{row.reason}</p>
      {row.status === 'error' && row.editable ? (
        <div className="mt-1 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Try again
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link to={replaceUrl}>Fix the link</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const RUN_META: Record<
  string,
  { icon: LucideIcon; tone: string; label: (r: SourceRunDTO) => string }
> = {
  ok: {
    icon: CircleCheck,
    tone: 'text-success',
    label: (r) =>
      r.new > 0
        ? `Found ${formatCount(r.new)} new`
        : r.updated > 0
          ? `Updated ${formatCount(r.updated)}`
          : 'Checked, all current',
  },
  not_modified: { icon: CircleDashed, tone: 'text-fg-tertiary', label: () => 'No changes' },
  error: {
    icon: CircleX,
    tone: 'text-danger',
    label: (r) => `Failed: ${r.errors[0]?.message ?? 'the page did not answer'}`,
  },
  deferred: { icon: CirclePause, tone: 'text-warning', label: () => 'Waiting for crawl budget' },
};

const REASON_LABEL: Record<string, string> = {
  scheduled: 'Scheduled check',
  manual: 'You asked',
  created: 'First check',
  enabled: 'Turned back on',
  pack: 'Pack turned on',
};

function durationLabel(ms: number | null): string | null {
  if (ms == null) return null;
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}

/** The last checks, newest first: what each found, how long it took, what it cost. */
function RecentChecks({ id, kind }: { id: string; kind: SourceTableRow['kind'] }) {
  const runs = useSourceRuns(id);
  const now = useNow(30_000);
  // No history endpoint yet (API gap) or nothing to show: the facts panel already has the last check.
  if (runs.isError || runs.data === null) return null;
  const items = runs.data ?? [];
  return (
    <Section title="Recent checks">
      {runs.isPending ? (
        <div role="status" aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">Loading recent checks</span>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-md" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-small text-fg-secondary">
          No checks yet. The first one runs within a minute of adding a source.
        </p>
      ) : (
        <ol data-testid="source-runs" className="relative flex flex-col" aria-label="Recent checks">
          {items.map((r, i) => {
            const meta = RUN_META[r.status] ?? RUN_META['not_modified']!;
            const Icon = meta.icon;
            const when = r.startedAt ?? r.finishedAt;
            const details = [
              REASON_LABEL[r.reason ?? ''] ?? null,
              durationLabel(r.durationMs),
              r.status === 'ok' || r.status === 'not_modified'
                ? `${formatCount(r.found)} listed`
                : null,
              kind === 'firecrawl'
                ? `${r.creditsUsed} ${r.creditsUsed === 1 ? 'credit' : 'credits'}`
                : null,
              r.backend === 'selfhosted' ? 'self-hosted standby' : null,
            ].filter(Boolean);
            const delay = stagger(i);
            return (
              <m.li
                key={r.id}
                data-status={r.status}
                variants={variants.row}
                custom={i}
                initial={delay === null ? false : 'hidden'}
                animate="visible"
                className="relative grid grid-cols-[1.25rem_minmax(0,1fr)_auto] gap-x-3 pb-4 last:pb-0"
              >
                {i < items.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-6 bottom-0 left-[0.5625rem] w-px bg-border"
                  />
                ) : null}
                <Icon
                  className={cn('mt-0.5 size-4.5', meta.tone)}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p
                    className={cn(
                      'truncate text-body',
                      r.status === 'error' ? 'text-danger' : 'text-fg',
                    )}
                    title={meta.label(r)}
                  >
                    {meta.label(r)}
                  </p>
                  {details.length > 0 ? (
                    <p className="truncate text-caption text-fg-tertiary">{details.join(' · ')}</p>
                  ) : null}
                </div>
                {when ? (
                  <time
                    dateTime={new Date(when).toISOString()}
                    title={formatAbsolute(when)}
                    className="font-mono text-mono-sm whitespace-nowrap text-fg-secondary"
                  >
                    {formatRelative(when, now)}
                  </time>
                ) : null}
              </m.li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}

function LatestListings({ id, found }: { id: string; found: number }) {
  const listings = useSourceListings(id);
  const items = listings.data ?? [];
  if (listings.isError || (listings.isSuccess && items.length === 0)) return null;
  return (
    <Section
      title="Newest listings"
      aside={
        found > 0 ? (
          <Link
            to={`/radar?source=${encodeURIComponent(id)}`}
            className="inline-flex items-center gap-1 rounded-xs text-small text-accent-strong underline-offset-3 hover:underline focus-visible:focus-ring"
          >
            See all in Radar{' '}
            <SquareArrowOutUpRight className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          </Link>
        ) : null
      }
    >
      {listings.isPending ? (
        <div role="status" aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">Loading listings</span>
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-md" />
          ))}
        </div>
      ) : (
        <Panel className="overflow-hidden">
          <ul className="flex flex-col divide-y divide-border-subtle">
            {items.map((l) => (
              <li key={l.id}>
                <Link
                  to={`/radar/${encodeURIComponent(l.id)}`}
                  className="flex min-h-14 items-center gap-3 px-4 py-2 transition-colors duration-fast hover:bg-surface-hover focus-visible:focus-ring-inset"
                >
                  <CompanyLogo name={l.company} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-medium text-fg">{l.title}</span>
                    <span className="block truncate text-small text-fg-secondary">{l.company}</span>
                  </span>
                  {l.score != null ? (
                    <FitRing score={Math.round(l.score)} size={28} animateId={l.id} />
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </Section>
  );
}

/** Watching, interval, tag and name; each saves on change with an inline "Saved". */
function SourceSettings({ row }: { row: SourceTableRow }) {
  const id = useId();
  const act = useSourceActions();
  const [saved, flash] = useSavedFlash();
  const [name, setName] = useState(row.name);
  const trimmed = name.trim();
  const nameInvalid = trimmed.length === 0 || trimmed.length > 160;
  const saveName = () => {
    if (nameInvalid || trimmed === row.name) return;
    act.update(row, { name: trimmed }, flash);
  };

  return (
    <Panel className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor={`${id}-on`}>Watching</Label>
          <p className="text-caption text-fg-tertiary">
            {row.enabled ? 'New listings reach your radar.' : 'Paused. Nothing new comes in.'}
          </p>
        </div>
        <Switch
          id={`${id}-on`}
          data-testid="source-enabled"
          checked={row.enabled}
          onCheckedChange={(v) => act.setEnabled(row, v)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-interval`}>Check</Label>
        <Select
          value={row.refreshInterval}
          onValueChange={(v) => act.update(row, { refreshInterval: v as RefreshInterval }, flash)}
        >
          <SelectTrigger id={`${id}-interval`} data-testid="source-interval" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INTERVAL_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-caption text-fg-tertiary">
          {row.kind === 'firecrawl'
            ? `This page is crawled (${KIND_LABELS[row.kind].toLowerCase()}): checking less often saves credits.`
            : `We'll check this page ${INTERVAL_OPTIONS.find((o) => o.value === row.refreshInterval)?.label.toLowerCase() ?? 'regularly'}.`}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-tag`}>Tag listings as</Label>
        <Select
          value={row.typeTag ?? ANY}
          onValueChange={(v) =>
            act.update(row, { typeTag: v === ANY ? null : (v as OpportunityType) }, flash)
          }
        >
          <SelectTrigger id={`${id}-tag`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Detect from each listing</SelectItem>
            {OPPORTUNITY_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {OPPORTUNITY_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input
          id={`${id}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              saveName();
            }
          }}
          aria-invalid={nameInvalid || undefined}
          aria-describedby={nameInvalid ? `${id}-name-err` : undefined}
        />
        {nameInvalid ? (
          <p id={`${id}-name-err`} className="text-small text-danger">
            Use 1–160 characters.
          </p>
        ) : null}
      </div>
      <m.p
        role="status"
        initial={false}
        animate={{ opacity: saved ? 1 : 0, transition: saved ? tweens.fadeIn : tweens.fadeOut }}
        className="-mt-2 min-h-4 text-caption text-success"
      >
        {saved ? 'Saved' : ''}
      </m.p>
    </Panel>
  );
}
