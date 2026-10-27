import { EmptyState, PageHeader, TableSkeleton } from '@kestrel/ui';
import { useQueryClient } from '@tanstack/react-query';
import type { VisibilityState } from '@tanstack/react-table';
import { CirclePause, Plus, Rss, Search, Server } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { deferCommit } from '../lib/deferred';
import { meterState } from '../lib/health';
import { RECOMMENDED_PACKS } from '../lib/packs';
import { buildRows, matchesQuery, type SourceTableRow } from '../lib/rows';

import { AddSourceDialog } from './AddSourceDialog';
import { CreditMeter } from './CreditMeter';
import { EditSourceDialog } from './EditSourceDialog';
import { PackDetail } from './PackDetail';
import { PacksGrid } from './PacksGrid';
import {
  ColumnsMenu,
  SOURCES_COLUMNS_KEY,
  SourcesTable,
  type SourcesTableActions,
} from './SourcesTable';

import {
  deleteSourceRequest,
  removeSourceFromCache,
  restoreSourcesCache,
  useCommunitySources,
  useCredits,
  usePacks,
  useRefreshSource,
  useSources,
  useTogglePack,
  useUpdateSource,
  type PackDTO,
} from '@/api/sources';
import { useCommandItems } from '@/components/command-palette/registry';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { errorMessage } from '@/lib/api';
import { useShortcut, useShortcutScope } from '@/lib/shortcuts';
import { readJson, writeJson } from '@/lib/storage';
import { withUndo } from '@/lib/undo';

type Tab = 'mine' | 'packs';

export function SourcesView() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'packs' ? 'packs' : 'mine';
  const addParam = params.get('add');
  const [addOpen, setAddOpen] = useState(addParam !== null);
  const [initialUrl, setInitialUrl] = useState<string | undefined>(
    addParam && addParam !== '1' ? addParam : undefined,
  );
  const [editRow, setEditRow] = useState<SourceTableRow | null>(null);
  const [openPackId, setOpenPackId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [visibility, setVisibilityState] = useState<VisibilityState>(() =>
    readJson<VisibilityState>(SOURCES_COLUMNS_KEY, {}),
  );

  const mine = useSources();
  const community = useCommunitySources();
  const packs = usePacks();
  const credits = useCredits();
  const update = useUpdateSource();
  const refresh = useRefreshSource();
  const togglePack = useTogglePack();

  const mode = credits.data ? meterState(credits.data).mode : null;
  const allRows = useMemo(
    () => buildRows(mine.data ?? [], community.data ?? [], packs.data ?? [], mode),
    [mine.data, community.data, packs.data, mode],
  );
  const rows = useMemo(() => allRows.filter((r) => matchesQuery(r, query)), [allRows, query]);
  const personalCount = mine.data?.length ?? 0;
  const subscribedCount = allRows.length - personalCount;
  const enabledPacks = (packs.data ?? []).filter((p) => p.enabled).length;
  const openPack = (packs.data ?? []).find((p) => p.id === openPackId) ?? null;

  const setTab = useCallback(
    (next: Tab) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === 'packs') p.set('tab', 'packs');
          else p.delete('tab');
          p.delete('add');
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const openAdd = useCallback((url?: string) => {
    setInitialUrl(url);
    setAddOpen(true);
  }, []);

  const setVisibility = (v: VisibilityState) => {
    setVisibilityState(v);
    writeJson(SOURCES_COLUMNS_KEY, v);
  };

  const onTogglePack = useCallback(
    (pack: PackDTO, enabled: boolean) => {
      if (enabled) {
        togglePack.mutate(
          { id: pack.id, enabled: true },
          {
            onSuccess: () => toast.success(`Turned on ${pack.name}.`),
            onError: (e) =>
              toast.error(`Couldn't turn on the pack. ${errorMessage(e)}`, { duration: 8000 }),
          },
        );
        return;
      }
      withUndo({
        message: `Turned off ${pack.name}.`,
        run: () => togglePack.mutateAsync({ id: pack.id, enabled: false }),
        undo: () => togglePack.mutateAsync({ id: pack.id, enabled: true }),
      });
    },
    [togglePack],
  );

  const actions = useMemo<SourcesTableActions>(
    () => ({
      onToggle: (row, enabled) =>
        update.mutate(
          { id: row.id, patch: { enabled } },
          {
            onSuccess: () => toast(enabled ? `Resumed ${row.name}.` : `Paused ${row.name}.`),
            onError: (e) =>
              toast.error(`Couldn't update ${row.name}. ${errorMessage(e)}`, { duration: 8000 }),
          },
        ),
      onInterval: (row, refreshInterval) =>
        update.mutate(
          { id: row.id, patch: { refreshInterval } },
          {
            onError: (e) =>
              toast.error(`Couldn't change the interval. ${errorMessage(e)}`, { duration: 8000 }),
          },
        ),
      onRefresh: (row) =>
        refresh.mutate(row.id, {
          onSuccess: () => toast(`Refreshing ${row.name}.`),
          onError: (e) =>
            toast.error(`Couldn't refresh ${row.name}. ${errorMessage(e)}`, { duration: 8000 }),
        }),
      onEdit: (row) => setEditRow(row),
      onDelete: (row) => {
        const previous = removeSourceFromCache(qc, row.id);
        const pending = deferCommit(`source:${row.id}`, () =>
          deleteSourceRequest(qc, row.id).catch((error: unknown) => {
            restoreSourcesCache(qc, previous);
            toast.error(`Couldn't delete ${row.name}. ${errorMessage(error)}`, { duration: 8000 });
          }),
        );
        withUndo({
          message: `Deleted “${row.name}”.`,
          run: () => undefined,
          undo: () => {
            pending.cancel();
            restoreSourcesCache(qc, previous);
          },
        });
      },
      onManagePack: (packId) => {
        setTab('packs');
        setOpenPackId(packId);
      },
    }),
    [qc, refresh, update, setTab],
  );

  useShortcutScope('sources');
  useShortcut('n', () => openAdd(), {
    scope: 'sources',
    description: 'Add source',
    group: 'Sources',
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
        label: 'My sources',
        icon: Rss,
        perform: () => setTab('mine'),
      },
    ],
    [openAdd, setTab],
  );

  const loading = (mine.isPending || community.isPending || packs.isPending) && !mine.isError;
  const loadError = mine.isError ? mine.error : community.isError ? community.error : null;
  const nothingOn = !loading && !loadError && personalCount === 0 && subscribedCount === 0;
  const capHit = credits.data ? credits.data.cloudUsedToday >= credits.data.cap : false;

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as Tab)}
      className="flex min-h-0 flex-col gap-0"
    >
      <PageHeader
        title="Sources"
        meta={loading ? undefined : `${allRows.length.toLocaleString('en-IN')} watched`}
        actions={
          <>
            <CreditMeter
              credits={credits.data}
              loading={credits.isPending}
              className="max-md:hidden"
            />
            <span data-testid="sources-add" className="inline-flex">
              <Button
                variant="primary"
                data-testid="sources-add-button"
                onClick={() => openAdd()}
                aria-keyshortcuts="N"
              >
                <Plus strokeWidth={1.5} /> <span className="max-sm:sr-only">Add source</span>
              </Button>
            </span>
          </>
        }
      >
        <TabsList variant="segmented" aria-label="Sources view">
          <TabsTrigger value="mine" data-testid="sources-tab-mine">
            My sources{' '}
            <span className="font-mono text-mono-sm text-fg-tertiary">{personalCount}</span>
          </TabsTrigger>
          <TabsTrigger value="packs" data-testid="sources-tab-packs">
            Packs{' '}
            <span className="font-mono text-mono-sm text-fg-tertiary">
              {enabledPacks}/{packs.data?.length ?? 0}
            </span>
          </TabsTrigger>
        </TabsList>
      </PageHeader>

      <div className="px-gutter pb-2 md:hidden">
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
              <Server
                className="mt-0.5 size-4 shrink-0 text-info"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span>
                Today’s cloud crawl budget is used up. Crawls are running on the self-hosted
                standby.
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

      <TabsContent value="mine" className="flex min-h-0 flex-col">
        {loading ? (
          <TableSkeleton rows={8} columns={6} />
        ) : loadError && !mine.data ? (
          <EmptyState
            icon={Rss}
            title="Couldn't load your sources."
            body={errorMessage(loadError)}
            action={
              <Button
                variant="secondary"
                onClick={() => void Promise.all([mine.refetch(), community.refetch()])}
              >
                Retry
              </Button>
            }
          />
        ) : nothingOn ? (
          <EmptyState
            variant="page"
            icon={Rss}
            title="No sources are on."
            body="Your radar has nothing to watch."
            action={
              <Button
                variant="primary"
                onClick={() => {
                  for (const id of RECOMMENDED_PACKS) togglePack.mutate({ id, enabled: true });
                  toast.success('Turned on 4 recommended packs.');
                }}
              >
                Turn on recommended packs
              </Button>
            }
            secondaryAction={
              <Button variant="ghost" onClick={() => openAdd()}>
                Add source
              </Button>
            }
          />
        ) : (
          <>
            {personalCount === 0 ? (
              <div className="mx-gutter mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-surface-raised px-4 py-3">
                <p className="flex-1 text-body text-fg-secondary">
                  <span className="font-medium text-fg">
                    Your packs cover {subscribedCount.toLocaleString('en-IN')} sources.
                  </span>{' '}
                  Add a careers page to watch one more company.
                </p>
                <Button variant="secondary" size="sm" onClick={() => openAdd()}>
                  Add source
                </Button>
              </div>
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
                  placeholder="Filter sources"
                  aria-label="Filter sources"
                  className="h-control-sm pl-8 text-small"
                />
              </div>
              <span className="font-mono text-mono-sm text-fg-tertiary" aria-live="polite">
                {rows.length === allRows.length
                  ? `${allRows.length}`
                  : `${rows.length} of ${allRows.length}`}
              </span>
              <div className="ml-auto">
                <ColumnsMenu value={visibility} onChange={setVisibility} />
              </div>
            </div>
            <SourcesTable
              rows={rows}
              actions={actions}
              visibility={visibility}
              emptyFilter={
                <>
                  No sources match “{query}”.{' '}
                  <button
                    type="button"
                    className="text-accent-strong hover:underline focus-visible:focus-ring"
                    onClick={() => setQuery('')}
                  >
                    Clear filter
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
            <p className="px-gutter pb-3 text-caption text-fg-tertiary">
              Packs are refreshed for everyone, so they don’t use your crawl budget.
            </p>
            <PacksGrid
              packs={packs.data}
              community={community.data ?? []}
              onToggle={onTogglePack}
              onOpen={(p) => setOpenPackId(p.id)}
            />
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
        onShowExisting={(id) => {
          const row = allRows.find((r) => r.id === id);
          setTab('mine');
          if (row) setQuery(row.name);
        }}
      />
      <EditSourceDialog
        row={editRow}
        onOpenChange={(o) => !o && setEditRow(null)}
        onReplaceUrl={(row) => {
          setEditRow(null);
          openAdd(row.url);
        }}
      />
      <PackDetail
        pack={openPack}
        sources={community.data ?? []}
        mode={mode}
        onOpenChange={(o) => !o && setOpenPackId(null)}
        onToggle={onTogglePack}
      />
    </Tabs>
  );
}
