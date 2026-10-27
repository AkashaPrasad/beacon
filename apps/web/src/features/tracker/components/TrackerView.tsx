import { Columns3, KanbanSquare, Plus, Radar, Rows3 } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';

import { useMe } from '@/api/me';
import { useSources } from '@/api/sources';
import { useTracker, useTrackerAnalytics } from '@/api/tracker';
import type { TrackerItemDTO } from '@/api/types';
import { useCommandItems } from '@/components/command-palette/registry';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Headline, HeadlineNumber } from '@/features/sources/components/common/Headline';
import { formatAbsolute } from '@/features/sources/lib/format';
import { errorMessage } from '@/lib/api';
import { cssEscape, rememberOpened, useListMemory } from '@/lib/list-memory';
import { useShortcut, useShortcutScope } from '@/lib/shortcuts';
import { readJson, writeJson } from '@/lib/storage';
import { useBreakpoint } from '@/lib/use-media-query';
import type { TrackerStage } from '@kestrel/shared';
import { EmptyState, PageHeader, TableSkeleton, useNow, variants } from '@kestrel/ui';

import { AddItemDialog } from './AddItemDialog';
import { AnalyticsHeader } from './AnalyticsHeader';
import { Board } from './Board';
import { BoardSkeleton } from './BoardSkeleton';
import { FollowUpTemplateDialog } from './FollowUpTemplateDialog';
import { NudgeList, type NudgeAction } from './NudgeList';
import { attentionItems } from '../lib/attention';
import type { NudgeKind } from '../lib/nudges';
import { useSnoozes } from '../lib/snoozes';
import { isClosedStage, type ClosedStage } from '../lib/stages';
import { useTrackerActions } from '../lib/use-tracker-actions';

const TrackerTable = lazy(() => import('./TrackerTable'));
const loadTable = () => void import('./TrackerTable');
const loadItemPage = () => void import('../TrackerItemPage');

type View = 'board' | 'table';
const VIEW_KEY = 'beacon:tracker:view';
const CLOSED_KEY = 'beacon:tracker:closed-open';

function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  } catch {
    return 'Asia/Kolkata';
  }
}

/**
 * Tracker (DESIGN §10.4, USERFLOW §4, UX restructure): a calm header (one-line stats with "See
 * stats", one nudge banner), then the board (Saved · Applied · OA / Test · Interview · Offer + a folded "Closed") or the
 * table. A card opens its full page at /tracker/:id. Every change is optimistic with Undo; the board
 * refetches on focus (two tabs) and recovers from a 409 by taking the server's board.
 */
export function TrackerView() {
  const tracker = useTracker();
  const analytics = useTrackerAnalytics();
  const me = useMe();
  const personalSources = useSources();
  const now = useNow(60_000);
  const snoozes = useSnoozes();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const bp = useBreakpoint();
  const phone = bp === 'base' || bp === 'sm';

  const [view, setViewState] = useState<View>(() =>
    readJson<View>(VIEW_KEY, 'board') === 'table' ? 'table' : 'board',
  );
  const [addStage, setAddStage] = useState<TrackerStage | null>(null);
  const [templateFor, setTemplateFor] = useState<TrackerItemDTO | null>(null);
  const [closedStage, setClosedStage] = useState<ClosedStage>('rejected');
  const [closedOpen, setClosedOpenState] = useState(() => readJson<boolean>(CLOSED_KEY, false));

  const items = useMemo(() => tracker.data ?? [], [tracker.data]);
  const attention = useMemo(() => attentionItems(items, now, snoozes), [items, now, snoozes]);
  const nudges = useMemo(() => new Map(attention.map((a) => [a.item.id, a.nudge])), [attention]);
  const timeZone = me.data?.settings.timezone || browserZone();

  const sourceNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const s of analytics.data?.bestSources ?? []) names.set(s.sourceId, s.name);
    for (const s of personalSources.data ?? []) names.set(s.id, s.name);
    return names;
  }, [analytics.data, personalSources.data]);

  const setView = useCallback((next: View) => {
    setViewState(next);
    writeJson(VIEW_KEY, next);
  }, []);
  const setClosedOpen = useCallback((open: boolean) => {
    setClosedOpenState(open);
    writeJson(CLOSED_KEY, open);
  }, []);
  const showStage = useCallback(
    (stage: TrackerStage) => {
      if (!isClosedStage(stage)) return;
      setClosedStage(stage);
      setClosedOpen(true);
    },
    [setClosedOpen],
  );

  const actions = useTrackerActions({ items, onStageShown: showStage });
  const boardRef = useRef<HTMLDivElement>(null);
  const openItem = useCallback(
    (id: string) => {
      // Back from the item page lands on this card again, with the board scrolled where it was.
      rememberOpened('tracker', id, { board: boardRef.current });
      void navigate(`/tracker/${encodeURIComponent(id)}`, { viewTransition: true });
    },
    [navigate],
  );
  useListMemory('tracker', {
    ready: items.length > 0,
    scrollers: { board: boardRef },
    focus: (id) => {
      const key = cssEscape(id);
      return `[data-testid="tracker-card"][data-item-id="${key}"], [data-testid="tracker-row"][data-item-id="${key}"] td button`;
    },
  });

  // The item page is one click away from every card: fetch its chunk while the board is idle.
  useEffect(() => {
    const idle =
      window.requestIdleCallback?.(loadItemPage) ?? window.setTimeout(loadItemPage, 1200);
    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
  }, []);

  const onNudgeAction = useCallback(
    (item: TrackerItemDTO, kind: NudgeKind, action: NudgeAction) => {
      switch (action.type) {
        case 'template':
          setTemplateFor(item);
          break;
        case 'followed_up':
        case 'snooze':
        case 'keep_waiting':
          actions.snooze(item, kind, action.type);
          break;
        case 'ghost':
          actions.moveToStage(item, 'ghosted');
          break;
        case 'reply':
          actions.moveToStage(item, action.stage);
          break;
        case 'open':
          openItem(item.id);
          break;
      }
    },
    [actions, openItem],
  );

  // ── Keyboard + palette ──────────────────────────────────────────────────────────────────
  useShortcutScope('tracker');
  useShortcut('n', () => setAddStage('saved'), {
    scope: 'tracker',
    description: 'Add to tracker',
    group: 'Tracker',
  });
  useShortcut('1', () => setView('board'), {
    scope: 'tracker',
    description: 'Board view',
    group: 'Tracker',
  });
  useShortcut('2', () => setView('table'), {
    scope: 'tracker',
    description: 'Table view',
    group: 'Tracker',
  });
  useCommandItems(
    () => [
      {
        id: 'tracker.add',
        group: 'Actions',
        label: 'Add to tracker by hand',
        shortcut: 'n',
        icon: Plus,
        perform: () => setAddStage('saved'),
      },
      {
        id: 'tracker.view.board',
        group: 'Views',
        label: 'Tracker board',
        shortcut: '1',
        icon: KanbanSquare,
        perform: () => setView('board'),
      },
      {
        id: 'tracker.view.table',
        group: 'Views',
        label: 'Tracker table',
        shortcut: '2',
        icon: Rows3,
        perform: () => setView('table'),
      },
      {
        id: 'tracker.more',
        group: 'Views',
        label: 'Show tests, rejections and ghosted',
        keywords: ['OA', 'online assessment', 'rejected', 'ghosted', 'closed'],
        icon: KanbanSquare,
        perform: () => setClosedOpen(true),
      },
    ],
    [setView, setClosedOpen],
  );

  // Old deep links (`?item=<id>`) now open the item page.
  const legacyItem = params.get('item');
  if (legacyItem) return <Navigate to={`/tracker/${encodeURIComponent(legacyItem)}`} replace />;

  const loading = tracker.isPending && !tracker.data;
  const empty = !loading && !tracker.isError && items.length === 0;
  const inFlight = items.filter(
    (i) => i.stage === 'applied' || i.stage === 'oa' || i.stage === 'interview',
  ).length;
  const interviews = items.filter((i) => i.stage === 'interview').length;
  const offers = items.filter((i) => i.stage === 'offer').length;
  const saved = items.filter((i) => i.stage === 'saved').length;
  const followUps = attention.length;

  return (
    <div className="flex min-h-0 flex-col">
      <PageHeader
        title="Tracker"
        hideTitle={phone}
        actions={
          <Button
            variant="primary"
            data-testid="tracker-add"
            aria-keyshortcuts="N"
            onClick={() => setAddStage('saved')}
          >
            <Plus strokeWidth={1.5} /> <span className="max-sm:sr-only">Add an application</span>
          </Button>
        }
      >
        <ToggleGroup
          type="single"
          segmented
          value={view}
          onValueChange={(v) => v && setView(v as View)}
          aria-label="Tracker view"
        >
          <ToggleGroupItem
            value="board"
            data-testid="tracker-view-board"
            aria-label="Board"
            aria-keyshortcuts="1"
          >
            <Columns3 strokeWidth={1.5} /> <span className="max-lg:sr-only">Board</span>
          </ToggleGroupItem>
          <ToggleGroupItem
            value="table"
            data-testid="tracker-view-table"
            aria-label="Table"
            aria-keyshortcuts="2"
            onPointerEnter={loadTable}
            onFocus={loadTable}
          >
            <Rows3 strokeWidth={1.5} /> <span className="max-lg:sr-only">Table</span>
          </ToggleGroupItem>
        </ToggleGroup>
      </PageHeader>

      {empty ? null : (
        <Headline loading={loading} testId="tracker-headline" className="pb-3">
          {inFlight + offers === 0 ? (
            <>
              <HeadlineNumber>{saved}</HeadlineNumber> saved, none applied yet. Pick the one that
              fits best and go.
            </>
          ) : (
            <>
              <HeadlineNumber>{inFlight + offers}</HeadlineNumber> applied
              {interviews > 0 ? (
                <>
                  {' · '}
                  <HeadlineNumber>{interviews}</HeadlineNumber> in interviews
                </>
              ) : null}
              {offers > 0 ? (
                <>
                  {' · '}
                  <HeadlineNumber>{offers}</HeadlineNumber> {offers === 1 ? 'offer' : 'offers'}
                </>
              ) : null}
              {' · '}
              {followUps > 0 ? (
                <>
                  <HeadlineNumber tone="warning">{followUps}</HeadlineNumber>{' '}
                  {followUps === 1 ? 'needs' : 'need'} a follow-up
                </>
              ) : (
                'nothing needs you right now'
              )}
              .
            </>
          )}
        </Headline>
      )}

      {tracker.isError && tracker.data ? (
        <div
          role="status"
          className="mx-gutter mb-3 flex flex-wrap items-center gap-2 rounded-md bg-surface-sunken px-3 py-2 text-small text-fg-secondary"
        >
          Couldn't refresh. Showing your board from{' '}
          {formatAbsolute(new Date(tracker.dataUpdatedAt), timeZone)}.
          <Button size="xs" variant="ghost" onClick={() => void tracker.refetch()}>
            Retry
          </Button>
        </div>
      ) : null}

      {loading ? (
        <>
          <AnalyticsHeader analytics={undefined} loading />
          {view === 'board' ? <BoardSkeleton /> : <TableSkeleton rows={6} columns={6} />}
        </>
      ) : tracker.isError && !tracker.data ? (
        <EmptyState
          icon={KanbanSquare}
          title="Couldn't load your tracker."
          body={errorMessage(tracker.error)}
          action={
            <Button variant="secondary" onClick={() => void tracker.refetch()}>
              Retry
            </Button>
          }
        />
      ) : empty ? (
        <EmptyState
          data-testid="tracker-empty"
          variant="page"
          icon={KanbanSquare}
          title="Nothing tracked yet."
          body="Press A on any listing, or drag one here from Deadlines."
          action={
            <Button asChild variant="primary">
              <Link to="/radar">
                <Radar strokeWidth={1.5} /> Go to Radar
              </Link>
            </Button>
          }
          secondaryAction={
            <Button variant="ghost" onClick={() => setAddStage('saved')}>
              Add one by hand
            </Button>
          }
        />
      ) : (
        <>
          <AnalyticsHeader
            analytics={analytics.data}
            loading={analytics.isPending && !analytics.data}
          />
          <NudgeList entries={attention} onAction={onNudgeAction} />
          <AnimatePresence mode="popLayout" initial={false}>
            <m.div
              key={view}
              variants={variants.fade}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="min-h-0"
            >
              {view === 'board' ? (
                <Board
                  scrollRef={boardRef}
                  items={items}
                  nudges={nudges}
                  now={now}
                  closedStage={closedStage}
                  onClosedStageChange={setClosedStage}
                  closedOpen={closedOpen}
                  onClosedOpenChange={setClosedOpen}
                  onOpen={openItem}
                  onMove={actions.commitMove}
                  onRemove={actions.removeItem}
                  onAdd={setAddStage}
                />
              ) : (
                <Suspense fallback={<TableSkeleton rows={6} columns={6} />}>
                  <TrackerTable
                    items={items}
                    nudges={nudges}
                    sourceNames={sourceNames}
                    now={now}
                    timeZone={timeZone}
                    onOpen={openItem}
                    onStage={actions.moveToStage}
                  />
                </Suspense>
              )}
            </m.div>
          </AnimatePresence>
        </>
      )}

      <AddItemDialog
        stage={addStage}
        onOpenChange={(open) => !open && setAddStage(null)}
        onCreate={actions.createManual}
      />
      <FollowUpTemplateDialog
        item={templateFor}
        userName={me.data?.user.name ?? null}
        onOpenChange={(open) => !open && setTemplateFor(null)}
        onFollowedUp={(item) => actions.snooze(item, 'follow_up', 'followed_up')}
      />
    </div>
  );
}
