import { useQueryClient } from '@tanstack/react-query';
import type { VisibilityState } from '@tanstack/react-table';
import { CirclePause, List, Plus, Rss, Search, Server, Table2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';

import {
  prefetchSourcePage,
  useCommunitySources,
  useCredits,
  usePacks,
  useSources,
} from '@/api/sources';
import { useCommandItems } from '@/components/command-palette/registry';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { errorMessage } from '@/lib/api';
import { useShortcut, useShortcutScope } from '@/lib/shortcuts';
import { readJson, writeJson } from '@/lib/storage';
import { useMediaQuery } from '@/lib/use-media-query';
import { EmptyState, PageHeader, Shortcut, TableSkeleton } from '@kestrel/ui';

import { AddSourceDialog } from './AddSourceDialog';
import { CreditMeter } from './CreditMeter';
import { EditSourceDialog } from './EditSourceDialog';
import { PacksGrid } from './PacksGrid';
import { ColumnsMenu, SOURCES_COLUMNS_KEY, SourcesTable, type SourcesTableActions } from './SourcesTable';
import { formatCount, formatTime } from '../lib/format';
import { meterState } from '../lib/health';
import { RECOMMENDED_PACKS } from '../lib/packs';
import { PACKS_PATH, SOURCES_PATH, sourcePath } from '../lib/paths';
import { buildRows, matchesQuery, type SourceTableRow } from '../lib/rows';
import { useSourceActions } from '../lib/use-source-actions';
import { useDetailsView } from '../lib/view-prefs';

type Tab = 'mine' | 'packs';

/**
 * /sources and /sources/packs (DESIGN §10.5, USERFLOW §5.1): a calm list by default with one hero
 * action, a quiet credit line, and everything else one step away (Details, the row menu, the source
 * and pack pages). `?add=1` opens the add dialog, `?add=<url>` prefills it; `?tab=packs` redirects.
 */
export function SourcesView() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const tab: Tab = location.pathname.replace(/\/+$/, '') === PACKS_PATH ? 'packs' : 'mine';
  const addParam = params.get('add');
  const [addOpen, setAddOpen] = useState(addParam !== null);
  const [initialUrl, setInitialUrl] = useState<string | undefined>(
    addParam && addParam !== '1' ? addParam : undefined,
  );
  const [editRow, setEditRow] = useState<SourceTableRow | null>(null);
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
  const allRows = useMemo(
    () => buildRows(mine.data ?? [], community.data ?? [], packs.data ?? [], mode),
    [mine.data, community.data, packs.data, mode],
  );
  const rows = useMemo(() => allRows.filter((r) => matchesQuery(r, query)), [allRows, query]);
  const personalCount = mine.data?.length ?? 0;
  const subscribedCount = allRows.length - personalCount;
  const enabledPacks = (packs.data ?? []).filter((p) => p.enabled).length;

  const setTab = useCallback(
    (next: Tab) => void navigate(next === 'packs' ? PACKS_PATH : SOURCES_PATH),
    [navigate],
  );

  const openAdd = useCallback((url?: string) => {
    setInitialUrl(url);
    setAddOpen(true);
  }, []);

  const toggleDetails = useCallback(() => {
    const next = !details;
    setDetails(next);
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
      onDelete: (row) => act.remove(row),
      onPrefetch: (row) => prefetchSourcePage(qc, row.id),
    }),
    [act, qc],
  );

  useShortcutScope('sources');
  useShortcut('n', () => openAdd(), { scope: 'sources', description: 'Add a source', group: 'Sources' });
  useShortcut('d', toggleDetails, {
    scope: 'sources',
    description: 'Show or hide source details',
    group: 'Sources',
    enabled: desktop,
  });
  useCommandItems(
    () => [
      { id: 'sources.add', group: 'Actions', label: 'Add a source', shortcut: 'n', icon: Plus, perform: () => openAdd() },
      { id: 'sources.packs', group: 'Views', label: 'Source packs', icon: Rss, perform: () => setTab('packs') },
      { id: 'sources.mine', group: 'Views', label: 'My sources', icon: Rss, perform: () => setTab('mine') },
      ...(desktop
        ? [
            {
              id: 'sources.details',
              group: 'Views',
              label: details ? 'Hide source details' : 'Show source details',
              keywords: ['columns', 'table', 'interval', 'last check'],
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

  const loading = (mine.isPending || community.isPending || packs.isPending) && !mine.isError;
  const loadError = mine.isError ? mine.error : community.isError ? community.error : null;
  const nothingOn = !loading && !loadError && personalCount === 0 && subscribedCount === 0;
  const capHit = credits.data ? credits.data.cloudUsedToday >= credits.data.cap : false;

  // Phones: the view switch gets its own full-width row, so it never slides under [Add source].
  const tabs = (
    <TabsList variant="segmented" aria-label="Sources view" className={wide ? undefined : 'w-full'}>
      <TabsTrigger value="mine" data-testid="sources-tab-mine">
        My sources{' '}
        <span className="font-mono text-mono-sm text-fg-secondary">{personalCount}</span>
      </TabsTrigger>
      <TabsTrigger value="packs" data-testid="sources-tab-packs">
        Packs{' '}
        <span className="font-mono text-mono-sm text-fg-secondary">
          {enabledPacks}/{packs.data?.length ?? 0}
        </span>
      </TabsTrigger>
    </TabsList>
  );

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex min-h-0 flex-col gap-0">
      <PageHeader
        title="Sources"
        meta={loading ? undefined : `${formatCount(allRows.length)} watched`}
        actions={
          <Tooltip>
            <TooltipTrigger asChild>
              <span data-testid="sources-add" className="inline-flex">
                <Button
                  variant="primary"
                  data-testid="sources-add-button"
                  onClick={() => openAdd()}
                  aria-keyshortcuts="N"
                >
                  <Plus strokeWidth={1.5} /> Add source
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Add a careers page or job board <Shortcut keys="n" className="ml-1" />
            </TooltipContent>
          </Tooltip>
        }
      >
        {wide ? tabs : null}
      </PageHeader>
      {wide ? null : <div className="px-gutter pb-2">{tabs}</div>}

      <div className="px-gutter pb-2">
        <CreditMeter credits={credits.data} loading={credits.isPending} />
      </div>

      {capHit && credits.data ? (
        <div
          data-testid="credit-cap-banner"
          role="status"
          className="mx-gutter mb-3 flex items-start gap-2 rounded-md bg-surface-sunken px-3 py-2 text-small text-fg-secondary"
        >
          {mode === 'selfhosted' ? (
            <>
              <Server className="mt-0.5 size-4 shrink-0 text-info" strokeWidth={1.5} aria-hidden="true" />
              <span>
                Today’s cloud crawl budget is used up, so crawls are running on the self-hosted
                standby. Nothing for you to do.
              </span>
            </>
          ) : (
            <>
              <CirclePause className="mt-0.5 size-4 shrink-0 text-warning" strokeWidth={1.5} aria-hidden="true" />
              <span>
                Today’s crawl budget is used up. Your sources refresh after 00:00 IST; shared packs
                keep updating.
              </span>
            </>
          )}
        </div>
      ) : null}

      <TabsContent value="mine" className="flex min-h-0 flex-col">
        {loading ? (
          <TableSkeleton rows={8} columns={5} />
        ) : loadError && !mine.data ? (
          <EmptyState
            icon={Rss}
            title="Couldn't load your sources."
            body={errorMessage(loadError)}
            action={
              <Button variant="secondary" onClick={() => void Promise.all([mine.refetch(), community.refetch()])}>
                Retry
              </Button>
            }
          />
        ) : nothingOn ? (
          <EmptyState
            variant="page"
            icon={Rss}
            title="No sources are on."
            body="Your radar has nothing to watch. Turn on a few packs to get going."
            action={
              <Button
                variant="primary"
                onClick={() => {
                  for (const pack of packs.data ?? []) {
                    if ((RECOMMENDED_PACKS as readonly string[]).includes(pack.id)) act.togglePack(pack, true);
                  }
                  toast.success('Turned on the recommended packs.');
                }}
              >
                Turn on recommended packs
              </Button>
            }
            secondaryAction={
              <Button variant="ghost" onClick={() => openAdd()}>
                Add a source
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
                  Couldn’t refresh. Showing sources from{' '}
                  <span className="font-mono">{formatTime(mine.dataUpdatedAt)}</span>.
                </span>
                <Button size="xs" variant="secondary" onClick={() => void mine.refetch()}>
                  Retry
                </Button>
              </div>
            ) : null}
            {personalCount === 0 ? (
              <p className="px-gutter pb-3 text-body text-fg-secondary">
                <span className="font-medium text-fg">
                  Your packs cover {formatCount(subscribedCount)} sources.
                </span>{' '}
                Add a careers page to watch one more company.{' '}
                <button
                  type="button"
                  className="rounded-xs text-accent-strong underline-offset-3 hover:underline focus-visible:focus-ring"
                  onClick={() => openAdd()}
                >
                  Add one
                </button>
              </p>
            ) : null}
            <div className="flex items-center gap-2 px-gutter pb-2">
              <div className="relative w-full max-w-72">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-tertiary"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Find a source"
                  aria-label="Find a source"
                  className="h-control-sm pl-8 text-small"
                />
              </div>
              <span className="text-small whitespace-nowrap text-fg-tertiary" aria-live="polite">
                <span className="font-mono">
                  {rows.length === allRows.length
                    ? formatCount(allRows.length)
                    : `${formatCount(rows.length)} of ${formatCount(allRows.length)}`}
                </span>{' '}
                {allRows.length === 1 ? 'source' : 'sources'}
              </span>
              {desktop ? (
                <div className="ml-auto flex items-center gap-1">
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
                      {details ? 'Back to the simple list' : 'Show every column and sorting'}{' '}
                      <Shortcut keys="d" className="ml-1" />
                    </TooltipContent>
                  </Tooltip>
                </div>
              ) : null}
            </div>
            <SourcesTable
              rows={rows}
              actions={actions}
              details={details}
              visibility={visibility}
              emptyFilter={
                <>
                  No sources match “{query}”.{' '}
                  <button
                    type="button"
                    className="rounded-xs text-accent-strong hover:underline focus-visible:focus-ring"
                    onClick={() => setQuery('')}
                  >
                    Show all
                  </button>
                </>
              }
            />
          </>
        )}
      </TabsContent>
      <TabsContent value="packs">
        {packs.isPending ? (
          <TableSkeleton rows={4} columns={3} />
        ) : packs.isError ? (
          <EmptyState
            icon={Rss}
            title="Couldn't load packs."
            body={errorMessage(packs.error)}
            action={
              <Button variant="secondary" onClick={() => void packs.refetch()}>
                Retry
              </Button>
            }
          />
        ) : (
          <>
            <p className="px-gutter pb-3 text-small text-fg-secondary">
              Packs are refreshed for everyone, so they don’t use your crawl budget.
            </p>
            <PacksGrid packs={packs.data} community={community.data ?? []} onToggle={act.togglePack} />
          </>
        )}
      </TabsContent>

      <AddSourceDialog
        open={addOpen}
        onOpenChange={(o) => {
          setAddOpen(o);
          if (!o && params.has('add')) {
            setParams(
              (prev) => {
                const p = new URLSearchParams(prev);
                p.delete('add');
                return p;
              },
              { replace: true },
            );
          }
        }}
        initialUrl={initialUrl}
        existing={mine.data ?? []}
        creditsPaused={mode === 'paused'}
        onShowExisting={(id) => void navigate(sourcePath(id))}
      />
      <EditSourceDialog
        row={editRow}
        onOpenChange={(o) => !o && setEditRow(null)}
        onReplaceUrl={(row) => {
          setEditRow(null);
          openAdd(row.url);
        }}
      />
    </Tabs>
  );
}
