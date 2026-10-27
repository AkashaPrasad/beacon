import { useQueryClient } from '@tanstack/react-query';
import type { VisibilityState } from '@tanstack/react-table';
import { ChevronRight, CirclePause, List, Plus, Rss, Search, Server, Table2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';

import {
  isInPack,
  prefetchSourcePage,
  useCommunitySources,
  useCredits,
  usePacks,
  useSources,
  type CommunityRow,
  type PackDTO,
} from '@/api/sources';
import { useCommandItems } from '@/components/command-palette/registry';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { errorMessage } from '@/lib/api';
import { rememberOpened } from '@/lib/list-memory';
import { useShortcut, useShortcutScope } from '@/lib/shortcuts';
import { readJson, writeJson } from '@/lib/storage';
import { useMediaQuery } from '@/lib/use-media-query';
import { CompanyLogo, EmptyState, Shortcut, Skeleton } from '@kestrel/ui';

import { AddSourcePanel } from './AddSourcePanel';
import { ListHeadline, HeadlineNumber } from './common/Headline';
import { CreditMeter } from './CreditMeter';
import { DeleteSourceDialog } from './DeleteSourceDialog';
import { EditSourceDialog } from './EditSourceDialog';
import { HealthBadge } from './HealthBadge';
import { PacksGrid } from './PacksGrid';
import {
  ColumnsMenu,
  SOURCES_COLUMNS_KEY,
  SourcesTable,
  type SourcesTableActions,
} from './SourcesTable';
import { candidateUrl } from '../lib/detect-machine';
import { formatCount, formatTime } from '../lib/format';
import { meterState, type CreditMode } from '../lib/health';
import { RECOMMENDED_PACKS } from '../lib/packs';
import { PACKS_PATH, SOURCES_PATH, sourcePath } from '../lib/paths';
import {
  buildRows,
  matchesQuery,
  shortPackName,
  sourceRowFrom,
  type SourceTableRow,
} from '../lib/rows';
import { useSourceActions } from '../lib/use-source-actions';
import { useDetailsView } from '../lib/view-prefs';

type Tab = 'mine' | 'packs';

/** Typing targets where a paste belongs to the field, not to "add this link". */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

/**
 * /sources and /sources/packs (UX restructure v2 §2.5, USERFLOW §5.1). The headline is the page H1
 * ("Beacon is watching 251 sources for you") with one quiet line and the credit meter; the "Add a
 * source" field is always at the top; then [Your sources] / [Packs]. "Your sources" lists only the
 * student's own sources (D13): pack sources are managed on each pack's page, and the search covers
 * both ("Is Stripe already watched?"). "Details" adds the operational columns. `?add=<url>`
 * prefills the field, `?add=1` focuses it, `?tab=packs` redirects to /sources/packs.
 */
export function SourcesView() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const tab: Tab = location.pathname.replace(/\/+$/, '') === PACKS_PATH ? 'packs' : 'mine';
  const addParam = params.get('add');
  const addInput = useRef<HTMLInputElement>(null);
  const [prefill, setPrefill] = useState<{ url: string; nonce: number } | null>(() =>
    addParam && addParam !== '1' ? { url: addParam, nonce: 1 } : null,
  );
  const [editRow, setEditRow] = useState<SourceTableRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<SourceTableRow | null>(null);
  const wide = useMediaQuery('(min-width: 640px)');
  const desktop = useMediaQuery('(min-width: 768px)');
  const [query, setQuery] = useState('');
  const [details, setDetails] = useDetailsView();
  const [visibility, setVisibilityState] = useState<VisibilityState>(() =>
    readJson<VisibilityState>(SOURCES_COLUMNS_KEY, {}),
  );

  const mine = useSources();
  const community = useCommunitySources();
  const packs = usePacks();
  const credits = useCredits();
  const act = useSourceActions();

  const mode = credits.data ? meterState(credits.data).mode : null;
  const rows = useMemo(
    () => buildRows(mine.data ?? [], [], packs.data ?? [], mode),
    [mine.data, packs.data, mode],
  );
  const shownRows = useMemo(() => rows.filter((r) => matchesQuery(r, query)), [rows, query]);
  const subscribed = useMemo(
    () => (community.data ?? []).filter((s) => s.subscribed),
    [community.data],
  );
  const personalCount = rows.length;
  const enabledPacks = (packs.data ?? []).filter((p) => p.enabled).length;
  const watched = personalCount + subscribed.length;
  const attention = rows.filter(
    (r) => r.enabled && (r.status === 'error' || r.status === 'warning'),
  ).length;

  const setTab = useCallback(
    (next: Tab) => void navigate(next === 'packs' ? PACKS_PATH : SOURCES_PATH),
    [navigate],
  );

  /** Focus the add field (and fill it, for a URL). */
  const openAdd = useCallback(
    (url?: string) => {
      if (tab !== 'mine') setTab('mine');
      if (url) setPrefill((p) => ({ url, nonce: (p?.nonce ?? 1) + 1 }));
      requestAnimationFrame(() => {
        addInput.current?.focus();
        addInput.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    },
    [tab, setTab],
  );

  // `?add=1` focuses the field once; the param is then dropped so a reload doesn't repeat it.
  useEffect(() => {
    if (addParam === null) return;
    if (addParam === '1') requestAnimationFrame(() => addInput.current?.focus());
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete('add');
        return p;
      },
      { replace: true },
    );
  }, [addParam, setParams]);

  // Paste a link anywhere on the page (outside a field) → the add field takes it.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isEditable(e.target) || isEditable(document.activeElement)) return;
      const text = e.clipboardData?.getData('text')?.trim() ?? '';
      if (!candidateUrl(text)) return;
      e.preventDefault();
      openAdd(text);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [openAdd]);

  const toggleDetails = useCallback(() => {
    setDetails(!details);
    if (tab !== 'mine') setTab('mine');
  }, [details, setDetails, tab, setTab]);

  const setVisibility = (v: VisibilityState) => {
    setVisibilityState(v);
    writeJson(SOURCES_COLUMNS_KEY, v);
  };

  const actions = useMemo<SourcesTableActions>(
    () => ({
      onToggle: (row, enabled) => act.setEnabled(row, enabled),
      onInterval: (row, refreshInterval) => act.update(row, { refreshInterval }),
      onRefresh: (row) => act.refresh(row),
      onEdit: (row) => setEditRow(row),
      onDelete: (row) => setDeleteRow(row),
      onPrefetch: (row) => prefetchSourcePage(qc, row.id),
    }),
    [act, qc],
  );

  useShortcutScope('sources');
  useShortcut('n', () => openAdd(), {
    scope: 'sources',
    description: 'Add a source',
    group: 'Sources',
  });
  useShortcut('d', toggleDetails, {
    scope: 'sources',
    description: 'Show or hide source details',
    group: 'Sources',
    enabled: desktop,
  });
  useCommandItems(
    () => [
      {
        id: 'sources.add',
        group: 'Actions',
        label: 'Add source',
        shortcut: 'n',
        icon: Plus,
        perform: () => openAdd(),
      },
      {
        id: 'sources.packs',
        group: 'Views',
        label: 'Source packs',
        icon: Rss,
        perform: () => setTab('packs'),
      },
      {
        id: 'sources.mine',
        group: 'Views',
        label: 'Your sources',
        icon: Rss,
        perform: () => setTab('mine'),
      },
      ...(desktop
        ? [
            {
              id: 'sources.details',
              group: 'Views',
              label: details ? 'Hide source details' : 'Show source details',
              keywords: ['columns', 'table', 'interval', 'last check', 'errors'],
              shortcut: 'd',
              icon: details ? List : Table2,
              perform: toggleDetails,
            },
          ]
        : []),
    ],
    [openAdd, setTab, toggleDetails, details, desktop],
  );

  // Old links: /sources?tab=packs → /sources/packs (keeps ?add=…).
  if (params.get('tab') === 'packs' && tab === 'mine') {
    const rest = new URLSearchParams(params);
    rest.delete('tab');
    const search = rest.toString();
    return <Navigate to={`${PACKS_PATH}${search ? `?${search}` : ''}`} replace />;
  }

  const loading = (mine.isPending || packs.isPending) && !mine.isError;
  const loadError = mine.isError ? mine.error : null;
  const nothingOn = !loading && !loadError && personalCount === 0 && enabledPacks === 0;
  const capHit = credits.data ? credits.data.cloudUsedToday >= credits.data.cap : false;

  const tabs = (
    <TabsList variant="segmented" aria-label="Sources view" className={wide ? undefined : 'w-full'}>
      <TabsTrigger value="mine" data-testid="sources-tab-mine">
        Your sources{' '}
        <span className="font-mono text-mono-sm text-fg-secondary">
          {formatCount(personalCount)}
        </span>
      </TabsTrigger>
      <TabsTrigger value="packs" data-testid="sources-tab-packs">
        Packs{' '}
        <span className="font-mono text-mono-sm text-fg-secondary">
          {enabledPacks} of {packs.data?.length ?? 0} on
        </span>
      </TabsTrigger>
    </TabsList>
  );

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as Tab)}
      className="mx-auto flex min-h-0 w-full max-w-content flex-col gap-0"
    >
      <ListHeadline
        testId="sources-headline"
        loading={loading}
        title={
          watched === 0 ? (
            'Add a source to light up your radar.'
          ) : (
            <>
              Beacon is watching <HeadlineNumber>{formatCount(watched)}</HeadlineNumber> sources for
              you
            </>
          )
        }
        line={
          watched === 0 ? null : (
            <>
              {formatCount(personalCount)} of yours · {enabledPacks}{' '}
              {enabledPacks === 1 ? 'pack' : 'packs'}
              {attention > 0 ? (
                <>
                  {' · '}
                  <span className="font-medium text-warning">
                    {attention} {attention === 1 ? 'needs' : 'need'} attention
                  </span>
                </>
              ) : null}
            </>
          )
        }
        aside={<CreditMeter credits={credits.data} loading={credits.isPending} />}
      />

      <div className="px-gutter pb-5">
        <AddSourcePanel
          prefill={prefill}
          inputRef={addInput}
          existing={mine.data ?? []}
          creditsPaused={mode === 'paused'}
          onShowExisting={(id) => void navigate(sourcePath(id))}
        />
      </div>

      {capHit && credits.data ? (
        <div
          data-testid="credit-cap-banner"
          role="status"
          className="mx-gutter mb-4 flex items-start gap-2 rounded-md border border-border-subtle bg-surface-sunken px-3 py-2 text-small text-fg-secondary"
        >
          {mode === 'selfhosted' ? (
            <>
              <Server
                className="mt-0.5 size-4 shrink-0 text-info"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span>
                Today’s cloud crawl budget is used up, so crawls are running on the self-hosted
                standby. Nothing for you to do.
              </span>
            </>
          ) : (
            <>
              <CirclePause
                className="mt-0.5 size-4 shrink-0 text-warning"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span>
                Today’s crawl budget is used up. Your sources refresh after 00:00 IST; shared packs
                keep updating.
              </span>
            </>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-gutter pb-3">
        {tabs}
        {tab === 'mine' ? (
          <div className="flex min-w-0 flex-1 items-center justify-end gap-1 max-sm:w-full">
            <div className="relative w-full max-w-72 min-w-0">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-tertiary"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Is a company already watched?"
                aria-label="Search your sources and packs"
                data-testid="sources-search"
                className="h-control-sm pl-8 text-small"
              />
            </div>
            {desktop ? (
              <>
                {details ? <ColumnsMenu value={visibility} onChange={setVisibility} /> : null}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-pressed={details}
                      aria-keyshortcuts="D"
                      data-testid="sources-details-toggle"
                      onClick={toggleDetails}
                      className="aria-pressed:bg-surface-active aria-pressed:text-fg"
                    >
                      <Table2 strokeWidth={1.5} /> Details
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {details ? 'Back to the simple list' : 'Interval, last and next check, errors'}{' '}
                    <Shortcut keys="d" className="ml-1" />
                  </TooltipContent>
                </Tooltip>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <TabsContent value="mine" className="flex min-h-0 flex-col">
        {loading ? (
          <SourceRowsSkeleton />
        ) : loadError && !mine.data ? (
          <EmptyState
            icon={Rss}
            title="Couldn't load your sources."
            body={errorMessage(loadError)}
            action={
              <Button variant="secondary" onClick={() => void mine.refetch()}>
                Try again
              </Button>
            }
          />
        ) : nothingOn ? (
          <EmptyState
            variant="page"
            icon={Rss}
            title="No sources are on."
            body="Your radar has nothing to watch. Add a careers page above, or turn on a few packs."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  for (const pack of packs.data ?? []) {
                    if ((RECOMMENDED_PACKS as readonly string[]).includes(pack.id))
                      act.togglePack(pack, true);
                  }
                  toast.success('Turned on the recommended packs.');
                }}
              >
                Turn on recommended packs
              </Button>
            }
          />
        ) : (
          <>
            {mine.isError && mine.data ? (
              <div
                role="status"
                data-testid="sources-stale-strip"
                className="mx-gutter mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-surface-sunken px-3 py-2 text-small text-fg-secondary"
              >
                <span className="flex-1">
                  Couldn’t refresh. Showing what we had at{' '}
                  <span className="font-mono">{formatTime(mine.dataUpdatedAt)}</span>.
                </span>
                <Button size="xs" variant="secondary" onClick={() => void mine.refetch()}>
                  Try again
                </Button>
              </div>
            ) : null}
            {personalCount === 0 ? (
              <div
                data-testid="sources-empty-mine"
                className="flex flex-col items-start gap-3 px-gutter py-6"
              >
                <p className="max-w-prose text-body text-fg-secondary">
                  <span className="font-medium text-fg">
                    Your packs cover {formatCount(subscribed.length)} sources.
                  </span>{' '}
                  Add a careers page to watch one more company.
                </p>
                <Button variant="secondary" onClick={() => openAdd()}>
                  <Plus strokeWidth={1.5} /> Add source
                </Button>
              </div>
            ) : (
              <SourcesTable
                rows={shownRows}
                actions={actions}
                details={details}
                visibility={visibility}
                emptyFilter={query ? <>None of your sources match “{query}”.</> : undefined}
              />
            )}
            {query.trim() ? (
              <PackMatches
                query={query}
                community={community.data ?? []}
                packs={packs.data ?? []}
                mode={mode}
              />
            ) : subscribed.length > 0 ? (
              <p
                data-testid="sources-packs-footer"
                className="px-gutter pt-4 pb-10 text-small text-fg-secondary"
              >
                Plus {formatCount(subscribed.length)} sources from {enabledPacks}{' '}
                {enabledPacks === 1 ? 'pack' : 'packs'}. They don’t use your crawl credits.{' '}
                <Link
                  to={PACKS_PATH}
                  className="inline-flex items-center gap-0.5 rounded-xs font-medium text-accent-strong underline-offset-3 hover:underline focus-visible:focus-ring"
                >
                  See packs{' '}
                  <ChevronRight className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                </Link>
              </p>
            ) : null}
          </>
        )}
      </TabsContent>
      <TabsContent value="packs">
        {packs.isPending ? (
          <PackCardsSkeleton />
        ) : packs.isError ? (
          <EmptyState
            icon={Rss}
            title="Couldn't load packs."
            body={errorMessage(packs.error)}
            action={
              <Button variant="secondary" onClick={() => void packs.refetch()}>
                Try again
              </Button>
            }
          />
        ) : (
          <>
            <p className="px-gutter pb-3 text-small text-fg-secondary">
              Curated by Beacon and refreshed for everyone, so packs never use your crawl credits.
            </p>
            <PacksGrid
              packs={packs.data}
              community={community.data ?? []}
              onToggle={act.togglePack}
            />
          </>
        )}
      </TabsContent>

      <EditSourceDialog
        row={editRow}
        onOpenChange={(o) => !o && setEditRow(null)}
        onReplaceUrl={(row) => {
          setEditRow(null);
          openAdd(row.url);
        }}
      />
      <DeleteSourceDialog
        source={deleteRow}
        onOpenChange={(o) => !o && setDeleteRow(null)}
        onConfirm={() => deleteRow && act.remove(deleteRow)}
      />
    </Tabs>
  );
}

/** "Is Stripe already watched?": pack sources matching the search, with the pack that covers them. */
function PackMatches({
  query,
  community,
  packs,
  mode,
}: {
  query: string;
  community: readonly CommunityRow[];
  packs: readonly PackDTO[];
  mode: CreditMode | null;
}) {
  const q = query.trim().toLowerCase();
  const matches = community
    .filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.url.toLowerCase().includes(q) ||
        (s.companyDomain ?? '').includes(q),
    )
    .sort((a, b) => Number(b.subscribed) - Number(a.subscribed) || a.name.localeCompare(b.name))
    .slice(0, 12);
  const packOf = (s: CommunityRow) =>
    packs.find((p) => p.enabled && isInPack(s, p.id)) ??
    packs.find((p) => isInPack(s, p.id)) ??
    null;
  return (
    <section
      aria-labelledby="sources-from-packs"
      className="flex flex-col gap-2 px-gutter pt-6 pb-10"
      data-testid="sources-pack-matches"
    >
      <h2 id="sources-from-packs" className="text-small font-medium text-fg-secondary">
        From packs
      </h2>
      {matches.length === 0 ? (
        <p className="text-small text-fg-tertiary">
          No pack covers “{query}” yet. Add its careers page above.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle border-y border-border-subtle">
          {matches.map((s) => {
            const pack = packOf(s);
            const row = sourceRowFrom(s, packs, mode);
            return (
              <li key={s.id}>
                <Link
                  to={sourcePath(s.id)}
                  onClick={() => rememberOpened('sources', s.id)}
                  className="flex min-h-12 items-center gap-3 px-2 py-2 transition-colors duration-fast hover:bg-surface-hover focus-visible:focus-ring-inset"
                >
                  <CompanyLogo name={s.name} domain={s.companyDomain} size={24} />
                  <span className="min-w-0 flex-1 truncate text-body font-medium text-fg">
                    {s.name}
                  </span>
                  <span className="truncate text-small text-fg-secondary">
                    {pack ? (
                      s.subscribed ? (
                        <>Watched in {shortPackName(pack.name)}</>
                      ) : (
                        <>In {shortPackName(pack.name)} (off)</>
                      )
                    ) : (
                      'In a pack'
                    )}
                  </span>
                  <HealthBadge
                    status={row.status}
                    reason={row.reason}
                    interactive={false}
                    variant="icon"
                    className="size-6 justify-center pr-0"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Same rows as the list (health · logo + name · kind · count · switch). */
function SourceRowsSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col">
      <span className="sr-only">Loading your sources</span>
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="flex min-h-14 items-center gap-4 border-b border-border-subtle px-gutter"
        >
          <Skeleton className="h-4 w-20 max-sm:hidden" />
          <Skeleton className="size-5 rounded-sm" />
          <Skeleton className="h-3.5 flex-1 max-w-56" />
          <Skeleton className="h-5 w-20 max-sm:hidden" />
          <Skeleton className="h-3.5 w-10" />
          <Skeleton className="h-5 w-9 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function PackCardsSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="grid gap-3 px-gutter pb-8 sm:grid-cols-2 xl:grid-cols-3"
    >
      <span className="sr-only">Loading packs</span>
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-40 w-full rounded-xl" />
      ))}
    </div>
  );
}
