import {
  ArrowLeft,
  ArrowUpRight,
  RefreshCw,
  Rss,
  SquareArrowOutUpRight,
  Trash2,
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
  useSources,
} from '@/api/sources';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';
import {
  OPPORTUNITY_TYPE_LABELS,
  OPPORTUNITY_TYPES,
  type OpportunityType,
  type RefreshInterval,
} from '@kestrel/shared';
import { CompanyLogo, EmptyState, ListSkeleton, tweens, useNow } from '@kestrel/ui';

import { CountUp } from './components/common/CountUp';
import { HealthBadge } from './components/HealthBadge';
import { KindBadge } from './components/KindBadge';
import { formatAbsolute, formatRelative } from './lib/format';
import { meterState } from './lib/health';
import { packPath, SOURCES_PATH } from './lib/paths';
import { displayUrl, INTERVAL_OPTIONS, KIND_LABELS, sourceRowFrom, type SourceTableRow } from './lib/rows';
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
 * /sources/:id: one source as a full page. Health and its reason, when it was last checked and when
 * it runs next, what it found (with the newest listings), its settings (saved on change) and the
 * actions: check now, open, delete. Renders from the list caches, so arriving from the table is instant.
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
    <div data-testid="sources-detail-page" className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-gutter py-4">
      <BackLink />
      {row && source ? (
        <SourceDetail row={row} createdAt={source.createdAt} />
      ) : notFound ? (
        <EmptyState
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
        <ListSkeleton rows={4} />
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to={SOURCES_PATH}
      className="-ml-1 inline-flex w-fit items-center gap-1.5 rounded-sm px-1 py-0.5 text-small text-fg-secondary hover:text-fg focus-visible:focus-ring"
    >
      <ArrowLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />
      Sources
    </Link>
  );
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-label text-fg-tertiary uppercase">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
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

function SourceDetail({ row, createdAt }: { row: SourceTableRow; createdAt: Date | string }) {
  const navigate = useNavigate();
  const act = useSourceActions();
  const now = useNow(30_000);
  const last = row.lastCheckedAt ? new Date(row.lastCheckedAt) : null;
  const next =
    last && row.enabled ? new Date(last.getTime() + INTERVAL_MS[row.refreshInterval]) : null;

  return (
    <m.article
      aria-labelledby="source-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: tweens.fadeIn }}
      className="flex flex-col gap-8"
    >
      <header className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <CompanyLogo name={row.name} domain={row.domain} size={40} />
        <div className="min-w-0 flex-1">
          <h1 id="source-title" className="font-display text-h1 text-balance text-fg">
            {row.name}
          </h1>
          <a
            href={row.url}
            target="_blank"
            rel="noreferrer noopener"
            className="group/url mt-0.5 inline-flex max-w-full items-center gap-1 rounded-xs font-mono text-mono-sm text-fg-secondary hover:text-fg focus-visible:focus-ring"
          >
            <span className="truncate">{displayUrl(row.url)}</span>
            <ArrowUpRight
              className="size-3.5 shrink-0 transition-transform duration-fast group-hover/url:translate-x-px group-hover/url:-translate-y-px"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
        {row.editable ? (
          <Button variant="secondary" onClick={() => act.refresh(row)} disabled={row.status === 'pending'}>
            <RefreshCw strokeWidth={1.5} /> Check now
          </Button>
        ) : null}
      </header>

      <div
        className={cn(
          'flex flex-col gap-1 rounded-md border px-4 py-3',
          row.status === 'error'
            ? 'border-danger/40 bg-danger-subtle'
            : row.status === 'paused' || row.status === 'warning'
              ? 'border-warning/40 bg-warning-subtle'
              : 'border-border-subtle bg-surface-sunken',
        )}
      >
        <HealthBadge status={row.status} reason={row.reason} interactive={false} className="text-body" />
        <p className="text-small text-fg-secondary">{row.reason}</p>
        {row.status === 'error' && row.editable ? (
          <div className="mt-1 flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => act.refresh(row)}>
              Try again
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <Link to={`${SOURCES_PATH}?add=${encodeURIComponent(row.url)}`}>Fix the link</Link>
            </Button>
          </div>
        ) : null}
      </div>

      <Section title="Activity">
        <dl className="flex flex-col divide-y divide-border-subtle border-y border-border-subtle">
          <Fact label="Last check">
            {last ? (
              <span title={formatAbsolute(last)}>
                <span className="font-mono text-mono">{formatRelative(last, now)}</span>
                <span className="ml-2 text-small text-fg-tertiary max-sm:hidden">{formatAbsolute(last)}</span>
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
          <Fact label="Listings found">
            <CountUp value={row.listingsFound} className="text-mono" onceId={`source-${row.id}`} />
          </Fact>
          <Fact label="Read as">
            <span className="inline-flex items-center gap-2">
              <KindBadge kind={row.kind} />
              <span className="text-small text-fg-secondary max-sm:hidden">
                {row.kind === 'firecrawl' ? 'uses crawl credits' : 'free'}
              </span>
            </span>
          </Fact>
          <Fact label="Added">
            <span className="text-small">{formatAbsolute(createdAt)}</span>
          </Fact>
        </dl>
      </Section>

      <LatestListings id={row.id} found={row.listingsFound} />

      <Section title="Settings">
        {row.editable ? (
          <SourceSettings row={row} />
        ) : (
          <p className="text-body text-fg-secondary">
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
            . Packs refresh on their own schedule for everyone, so there is nothing to set here.
          </p>
        )}
      </Section>

      {row.editable ? (
        <Section title="Remove">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-small text-fg-secondary">
              Stops watching this page. Listings it already found stay in your tracker.
            </p>
            <Button
              variant="ghost"
              className="text-danger hover:text-danger"
              onClick={() => {
                act.remove(row);
                void navigate(SOURCES_PATH);
              }}
            >
              <Trash2 strokeWidth={1.5} /> Delete source
            </Button>
          </div>
        </Section>
      ) : null}
    </m.article>
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
            See all in Radar <SquareArrowOutUpRight className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          </Link>
        ) : null
      }
    >
      {listings.isPending ? (
        <ListSkeleton rows={3} />
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle border-y border-border-subtle">
          {items.map((l) => (
            <li key={l.id}>
              <Link
                to={`/radar/${encodeURIComponent(l.id)}`}
                className="flex min-h-11 items-center gap-3 py-2 hover:bg-surface-hover focus-visible:focus-ring-inset"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-medium text-fg">{l.title}</span>
                  <span className="block truncate text-small text-fg-secondary">{l.company}</span>
                </span>
                {l.score != null ? (
                  <span className="font-mono text-mono-sm text-fg-secondary">Fit {Math.round(l.score)}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** Name, type, interval and the switch; each saves on change with an inline "Saved". */
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
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
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
          <Label htmlFor={`${id}-interval`}>Check</Label>
          <Select
            value={row.refreshInterval}
            onValueChange={(v) => act.update(row, { refreshInterval: v as RefreshInterval }, flash)}
          >
            <SelectTrigger id={`${id}-interval`} aria-label={`Refresh interval for ${row.name}`} className="w-full">
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
          {row.kind === 'firecrawl' ? (
            <p className="text-caption text-fg-tertiary">
              This page is crawled ({KIND_LABELS[row.kind].toLowerCase()}): checking less often saves
              credits.
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 rounded-md border border-border-subtle px-3 py-2">
        <div>
          <Label htmlFor={`${id}-on`}>Watching</Label>
          <p className="text-caption text-fg-tertiary">
            {row.enabled ? 'New listings from this page reach your radar.' : 'Paused. Nothing new comes in.'}
          </p>
        </div>
        <Switch
          id={`${id}-on`}
          checked={row.enabled}
          onCheckedChange={(v) => act.setEnabled(row, v)}
        />
      </div>
      <div className="flex min-h-5 flex-wrap items-center justify-between gap-2">
        <p className="text-small text-fg-secondary">
          Watching a different address?{' '}
          <Link
            to={`${SOURCES_PATH}?add=${encodeURIComponent(row.url)}`}
            className="rounded-xs text-accent-strong underline-offset-3 hover:underline focus-visible:focus-ring"
          >
            Replace the URL
          </Link>
        </p>
        <m.span
          role="status"
          initial={false}
          animate={{ opacity: saved ? 1 : 0, transition: saved ? tweens.fadeIn : tweens.fadeOut }}
          className="text-caption text-success"
        >
          {saved ? 'Saved' : ''}
        </m.span>
      </div>
    </div>
  );
}
