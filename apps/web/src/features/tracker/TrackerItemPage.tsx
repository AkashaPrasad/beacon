import { ChevronLeft, KanbanSquare } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { useMe } from '@/api/me';
import { useSources } from '@/api/sources';
import { useTracker, useTrackerAnalytics } from '@/api/tracker';
import type { TrackerItemDTO } from '@/api/types';
import { DetailPageHeader } from '@/components/detail-page-header';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api';
import { rememberOpened } from '@/lib/list-memory';
import { useBackNavigation } from '@/lib/use-back-navigation';
import { TRACKER_STAGES } from '@kestrel/shared';
import { EmptyState, Skeleton, useNow } from '@kestrel/ui';

import { ItemDetail } from './components/detail/ItemDetail';
import { FollowUpTemplateDialog } from './components/FollowUpTemplateDialog';
import type { NudgeAction } from './components/NudgeList';
import { computeNudge, type NudgeKind } from './lib/nudges';
import { useSnoozes } from './lib/snoozes';
import { useTrackerActions } from './lib/use-tracker-actions';

function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  } catch {
    return 'Asia/Kolkata';
  }
}

/**
 * /tracker/:id: one application as a full page (UX restructure §2 Tracker; also the target of
 * notification links `/tracker?item=<id>`, rewritten by the root layout). Back (or Esc) returns to
 * the board on the same card and scroll position; `k` / `j` step through the board in order.
 */
export function Component() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const back = useBackNavigation('/tracker');
  const tracker = useTracker();
  const analytics = useTrackerAnalytics();
  const personalSources = useSources();
  const me = useMe();
  const now = useNow(60_000);
  const snoozes = useSnoozes();
  const [templateFor, setTemplateFor] = useState<TrackerItemDTO | null>(null);

  const items = useMemo(() => tracker.data ?? [], [tracker.data]);
  const item = items.find((i) => i.id === id) ?? null;
  const actions = useTrackerActions({ items, onRemoved: back });

  // Board order: stage by stage, then position (the same order the columns show).
  const ordered = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          TRACKER_STAGES.indexOf(a.stage) - TRACKER_STAGES.indexOf(b.stage) ||
          a.position - b.position,
      ),
    [items],
  );
  const index = item ? ordered.findIndex((i) => i.id === item.id) : -1;
  const go = useCallback(
    (target: TrackerItemDTO | undefined) => {
      if (!target) return;
      // Replace, so Back still returns to the board (on the card you ended on).
      rememberOpened('tracker', target.id);
      void navigate(`/tracker/${encodeURIComponent(target.id)}`, { replace: true });
    },
    [navigate],
  );
  const pager =
    index >= 0 && ordered.length > 1
      ? {
          onPrev: index > 0 ? () => go(ordered[index - 1]) : undefined,
          onNext: index < ordered.length - 1 ? () => go(ordered[index + 1]) : undefined,
          position: `${index + 1} of ${ordered.length}`,
          prevLabel: 'Previous application',
          nextLabel: 'Next application',
        }
      : undefined;
  const timeZone = me.data?.settings.timezone || browserZone();

  const sourceName = useMemo(() => {
    if (!item?.sourceId) return null;
    return (
      personalSources.data?.find((s) => s.id === item.sourceId)?.name ??
      analytics.data?.bestSources.find((s) => s.sourceId === item.sourceId)?.name ??
      null
    );
  }, [analytics.data, item, personalSources.data]);

  const onNudgeAction = (target: TrackerItemDTO, kind: NudgeKind, action: NudgeAction) => {
    switch (action.type) {
      case 'template':
        setTemplateFor(target);
        break;
      case 'followed_up':
      case 'snooze':
      case 'keep_waiting':
        actions.snooze(target, kind, action.type);
        break;
      case 'ghost':
        actions.moveToStage(target, 'ghosted');
        break;
      case 'reply':
        actions.moveToStage(target, action.stage);
        break;
      case 'open':
        break;
    }
  };

  return (
    <div data-testid="tracker-item-page" className="flex min-h-0 flex-col">
      {item ? (
        <ItemDetail
          key={item.id}
          item={item}
          nudge={computeNudge(item, now, snoozes[item.id] ?? [])}
          sourceName={sourceName}
          timeZone={timeZone}
          onStage={actions.moveToStage}
          onPatch={actions.patchItem}
          onRemove={actions.removeItem}
          onNudgeAction={onNudgeAction}
          onTrackSimilar={actions.trackSimilar}
          pager={pager}
        />
      ) : tracker.isPending ? (
        <div className="mx-auto flex w-full max-w-5xl flex-col">
          <DetailPageHeader
            parent={{ label: 'Tracker', to: '/tracker' }}
            title="Application"
            hideTitle
          />
          <div role="status" aria-busy="true" className="flex flex-col gap-6 px-gutter">
            <span className="sr-only">Loading the application</span>
            <Skeleton className="h-8 w-2/3" />
            <div className="flex items-center gap-4">
              <Skeleton className="size-10 rounded-sm" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3.5 w-1/4" />
              </div>
              <Skeleton className="h-9 w-44 rounded-sm" />
            </div>
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <Skeleton className="h-40 w-full rounded-xl" />
              <Skeleton className="h-56 w-full rounded-xl" />
            </div>
          </div>
        </div>
      ) : (
        <>
          <DetailPageHeader
            parent={{ label: 'Tracker', to: '/tracker' }}
            title="Application"
            hideTitle
          />
          <EmptyState
            variant="page"
            icon={KanbanSquare}
            title={
              tracker.isError
                ? "Couldn't load this application."
                : "This application isn't in your tracker."
            }
            body={
              tracker.isError
                ? errorMessage(tracker.error)
                : 'It may have been removed, here or in another tab.'
            }
            action={
              tracker.isError ? (
                <Button variant="secondary" onClick={() => void tracker.refetch()}>
                  Retry
                </Button>
              ) : (
                <Button asChild variant="primary">
                  <Link to="/tracker">
                    <ChevronLeft strokeWidth={1.5} /> Back to tracker
                  </Link>
                </Button>
              )
            }
          />
        </>
      )}
      <FollowUpTemplateDialog
        item={templateFor}
        userName={me.data?.user.name ?? null}
        onOpenChange={(open) => !open && setTemplateFor(null)}
        onFollowedUp={(target) => actions.snooze(target, 'follow_up', 'followed_up')}
      />
    </div>
  );
}
