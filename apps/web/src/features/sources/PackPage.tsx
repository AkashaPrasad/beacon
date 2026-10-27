import { ChevronRight, Package, Search } from 'lucide-react';
import { m } from 'motion/react';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';

import {
  isInPack,
  useCommunitySources,
  useCredits,
  usePacks,
  type CommunityRow,
  type PackDTO,
} from '@/api/sources';
import { DetailPageHeader } from '@/components/detail-page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cssEscape, rememberOpened, useListMemory } from '@/lib/list-memory';
import { cn } from '@/lib/utils';
import type { SourceKind } from '@kestrel/shared';
import { CompanyLogo, EmptyState, Skeleton, springs, stagger, tweens } from '@kestrel/ui';

import { CountUp } from './components/common/CountUp';
import { HealthBadge } from './components/HealthBadge';
import { KindBadge } from './components/KindBadge';
import { formatCount } from './lib/format';
import { meterState, type CreditMode } from './lib/health';
import { KIND_ICONS } from './lib/kind-icons';
import { PACK_BLURBS } from './lib/packs';
import { PACKS_PATH, sourcePath } from './lib/paths';
import { displayUrl, KIND_LABELS, sourceRowFrom, type SourceTableRow } from './lib/rows';
import { useSourceActions } from './lib/use-source-actions';

const ALIASES: Record<string, string> = {
  'india-product': 'top-indian-product',
  'faang-india': 'faang-plus-india',
  'yc-startups': 'yc-startups-interns',
  hackathons: 'hackathons-india',
  scholarships: 'scholarships-engineering',
  'remote-friendly': 'remote-friendly-startups',
};

const LOGO_CLOUD_MAX = 14;
const SEARCH_FROM = 10;

/**
 * /sources/packs/:id: one curated pack as a full page (UX restructure §2 Sources). What it covers in
 * one sentence, the companies in it as a logo cloud, how its sources are read and how healthy they
 * are, the on/off switch (the page's one primary control), and every source in it, each linking to
 * its own page. Renders from the list caches (Packs tab → here is instant).
 */
export function Component() {
  const { id: rawId = '' } = useParams();
  const id = ALIASES[rawId] ?? rawId;
  const packs = usePacks();
  const community = useCommunitySources();
  const credits = useCredits();
  const pack = packs.data?.find((p) => p.id === id) ?? null;
  const mode = credits.data ? meterState(credits.data).mode : null;

  return (
    <div data-testid="pack-page" className="mx-auto flex w-full max-w-5xl flex-col pb-16">
      {pack ? (
        <PackDetail pack={pack} sources={community.data ?? null} mode={mode} />
      ) : (
        <>
          <DetailPageHeader
            parent={{ label: 'Packs', to: PACKS_PATH }}
            title="Source pack"
            hideTitle={!packs.isSuccess && !packs.isError}
          />
          {packs.isPending ? (
            <PackSkeleton />
          ) : packs.isError ? (
            <EmptyState
              variant="page"
              icon={Package}
              title="Couldn't load this pack."
              body="Check your connection and try again."
              action={
                <Button variant="secondary" onClick={() => void packs.refetch()}>
                  Retry
                </Button>
              }
            />
          ) : (
            <EmptyState
              variant="page"
              icon={Package}
              title="This pack isn’t here."
              body="It may have been renamed. Every pack is on the Packs tab."
              action={
                <Button variant="secondary" asChild>
                  <Link to={PACKS_PATH}>See all packs</Link>
                </Button>
              }
            />
          )}
        </>
      )}
    </div>
  );
}

function PackSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6 px-gutter pt-2">
      <span className="sr-only">Loading the pack</span>
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-40 w-full rounded-lg" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}

function PackDetail({
  pack,
  sources,
  mode,
}: {
  pack: PackDTO;
  sources: readonly CommunityRow[] | null;
  mode: CreditMode | null;
}) {
  const act = useSourceActions();
  const switchId = useId();
  const [query, setQuery] = useState('');

  const rows = useMemo<SourceTableRow[]>(() => {
    if (!sources) return [];
    return sources
      .filter((s) => isInPack(s, pack.id))
      .map((s) => sourceRowFrom({ ...s, subscribed: pack.enabled }, [pack], mode))
      .sort((a, b) => b.listingsFound - a.listingsFound || a.name.localeCompare(b.name));
  }, [sources, pack, mode]);

  const listings = rows.reduce((n, r) => n + r.listingsFound, 0);
  const domains = useMemo(() => {
    const seen: string[] = [];
    for (const r of rows) if (r.domain && !seen.includes(r.domain)) seen.push(r.domain);
    return seen;
  }, [rows]);
  const failing = rows.filter((r) => r.status === 'error').length;
  const slow = rows.filter((r) => r.status === 'warning').length;
  const kinds = (Object.entries(pack.kinds) as [SourceKind, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const q = query.trim().toLowerCase();
  const shown = q
    ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.url.toLowerCase().includes(q))
    : rows;

  useListMemory(`pack:${pack.id}`, {
    ready: rows.length > 0,
    focus: (sid) => `[data-testid="pack-source"][data-source-id="${cssEscape(sid)}"] a`,
  });

  return (
    <m.article
      aria-labelledby="pack-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: tweens.fadeIn }}
      className="flex flex-col"
    >
      <DetailPageHeader
        parent={{ label: 'Packs', to: PACKS_PATH }}
        trail={[pack.name]}
        titleId="pack-title"
        title={pack.name}
        actions={
          <label
            htmlFor={switchId}
            className={cn(
              'inline-flex h-9 cursor-pointer items-center gap-2.5 rounded-md border px-3 text-small font-medium transition-colors duration-fast',
              pack.enabled
                ? 'border-accent-strong/40 bg-accent-subtle text-accent-subtle-fg'
                : 'border-border text-fg-secondary hover:text-fg',
            )}
          >
            Watching<span className="sr-only"> {pack.name}</span>
            <Switch
              id={switchId}
              data-testid="pack-enabled"
              checked={pack.enabled}
              onCheckedChange={(v) => act.togglePack(pack, v)}
            />
          </label>
        }
      />

      <div className="px-gutter pb-8">
        <section
          aria-label="About this pack"
          data-enabled={pack.enabled}
          className={cn(
            'e2 relative flex flex-col gap-5 overflow-hidden rounded-lg border p-5 sm:p-6',
            pack.enabled ? 'border-accent-strong/25' : 'border-border-subtle',
          )}
        >
          <p className="max-w-prose text-body-lg text-pretty text-fg">
            {PACK_BLURBS[pack.id] ?? 'A curated list of sources, refreshed for everyone.'}
          </p>

          {domains.length > 0 ? (
            <ul aria-label="Companies in this pack" className="flex flex-wrap items-center gap-2">
              {domains.slice(0, LOGO_CLOUD_MAX).map((d, i) => {
                const delay = stagger(i);
                return (
                  <m.li
                    key={d}
                    title={d}
                    initial={delay === null ? false : { opacity: 0, y: 4 }}
                    animate={{
                      opacity: pack.enabled ? 1 : 0.7,
                      y: 0,
                      transition: { ...springs.gentle, delay: delay ?? 0 },
                    }}
                    className="rounded-md bg-surface p-1 shadow-e1"
                  >
                    <CompanyLogo name={d} domain={d} size={28} />
                    <span className="sr-only">{d}</span>
                  </m.li>
                );
              })}
              {domains.length > LOGO_CLOUD_MAX ? (
                <li className="px-1 font-mono text-mono-sm text-fg-tertiary">
                  +{domains.length - LOGO_CLOUD_MAX}
                </li>
              ) : null}
            </ul>
          ) : sources === null ? (
            <div className="flex gap-2" aria-hidden="true">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="size-9 rounded-md" />
              ))}
            </div>
          ) : null}

          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border-subtle pt-4 sm:grid-cols-4">
            <Stat label="Sources">
              <CountUp value={pack.sourceCount} onceId={`pack-${pack.id}-sources`} />
            </Stat>
            <Stat label="Open listings">
              {sources === null ? (
                <Skeleton className="my-1.5 h-5 w-12" />
              ) : (
                <CountUp value={listings} onceId={`pack-${pack.id}-listings`} />
              )}
            </Stat>
            <div className="col-span-2 flex min-w-0 flex-col gap-1.5">
              <dt className="text-label text-fg-tertiary uppercase">Read as</dt>
              <dd className="flex flex-wrap gap-1.5">
                {kinds.map(([kind, n]) => {
                  const Icon = KIND_ICONS[kind];
                  return (
                    <span
                      key={kind}
                      className="inline-flex h-6 items-center gap-1 rounded-xs bg-surface-sunken px-2 text-caption text-fg-secondary"
                    >
                      <Icon className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                      {KIND_LABELS[kind]}{' '}
                      <span className="font-mono text-mono-sm text-fg">{n}</span>
                    </span>
                  );
                })}
              </dd>
            </div>
          </dl>

          <p className="text-small text-fg-secondary">
            {failing > 0
              ? `${failing} ${failing === 1 ? 'source is' : 'sources are'} failing right now; the rest keep updating. `
              : slow > 0
                ? `${slow} ${slow === 1 ? 'source is' : 'sources are'} slow right now; they retry on their own. `
                : 'Every source in it is healthy. '}
            Packs are refreshed for everyone, so they don’t use your crawl budget.
          </p>
          {!pack.enabled ? (
            <div className="flex flex-wrap items-center gap-3 rounded-md bg-accent-subtle px-4 py-3">
              <p className="min-w-0 flex-1 text-small text-accent-subtle-fg">
                Turn it on to add these {formatCount(pack.sourceCount)} sources to your radar.
              </p>
              <Button size="sm" variant="secondary" onClick={() => act.togglePack(pack, true)}>
                Turn on
              </Button>
            </div>
          ) : null}
        </section>
      </div>

      <section aria-labelledby="pack-sources-title" className="flex flex-col gap-3 px-gutter">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="pack-sources-title" className="font-display text-h2 text-fg">
            What’s in it
          </h2>
          {rows.length > SEARCH_FROM ? (
            <div className="relative w-full max-w-64">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-tertiary"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a company"
                aria-label="Find a company in this pack"
                className="h-control-sm pl-8 text-small"
              />
            </div>
          ) : null}
        </div>
        {sources === null ? (
          <div role="status" aria-busy="true" className="flex flex-col gap-2">
            <span className="sr-only">Loading sources</span>
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-md" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <p className="py-6 text-center text-body text-fg-secondary">
            {q ? `Nothing in this pack matches “${query}”.` : 'This pack has no sources yet.'}
          </p>
        ) : (
          <ul
            data-testid="pack-sources"
            aria-label={`Sources in ${pack.name}`}
            className="e2 flex flex-col divide-y divide-border-subtle overflow-hidden rounded-lg border border-border-subtle"
          >
            {shown.map((r) => (
              <li key={r.id} data-testid="pack-source" data-source-id={r.id} data-health={r.health}>
                <Link
                  to={sourcePath(r.id)}
                  onClick={() => rememberOpened(`pack:${pack.id}`, r.id)}
                  className="group/row flex min-h-14 items-center gap-3 px-4 py-2 transition-colors duration-fast hover:bg-surface-hover focus-visible:focus-ring-inset"
                >
                  <CompanyLogo name={r.name} domain={r.domain} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-medium text-fg" title={r.name}>
                      {r.name}
                    </span>
                    <span className="block truncate font-mono text-mono-sm text-fg-tertiary">
                      {displayUrl(r.url)}
                    </span>
                  </span>
                  <KindBadge kind={r.kind} className="max-sm:hidden" />
                  <HealthBadge
                    status={r.status}
                    reason={r.reason}
                    interactive={false}
                    variant="icon"
                    className="size-6 justify-center pr-0"
                  />
                  <span className="w-12 text-right font-mono text-mono text-fg tabular-nums">
                    {formatCount(r.listingsFound)}
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-fg-tertiary transition-transform duration-fast group-hover/row:translate-x-0.5"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </m.article>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-label text-fg-tertiary uppercase">{label}</dt>
      <dd className="font-mono text-mono-lg text-fg tabular-nums">{children}</dd>
    </div>
  );
}
