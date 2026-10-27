import { ChevronLeft, KanbanSquare } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { useMe } from '@/api/me';
import { useSources } from '@/api/sources';
import { useTracker, useTrackerAnalytics } from '@/api/tracker';
import type { TrackerItemDTO } from '@/api/types';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api';
import { useShortcut, useShortcutScope } from '@/lib/shortcuts';
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

/** /tracker/:id: one application as a full page (Esc or Back returns to the board). */
export function Component() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const tracker = useTracker();
  const analytics = useTrackerAnalytics();
  const personalSources = useSources();
  const me = useMe();
  const now = useNow(60_000);
  const snoozes = useSnoozes();
  const [templateFor, setTemplateFor] = useState<TrackerItemDTO | null>(null);

  const items = useMemo(() => tracker.data ?? [], [tracker.data]);
  const item = items.find((i) => i.id === id) ?? null;
  const actions = useTrackerActions({ items, onRemoved: () => void navigate('/tracker', { viewTransition: true }) });
  const timeZone = me.data?.settings.timezone || browserZone();

  const sourceName = useMemo(() => {
    if (!item?.sourceId) return null;
    return (
      personalSources.data?.find((s) => s.id === item.sourceId)?.name ??
      analytics.data?.bestSources.find((s) => s.sourceId === item.sourceId)?.name ??
      null
    );
  }, [analytics.data, item, personalSources.data]);

  useShortcutScope('tracker-item');
  useShortcut('escape', () => void navigate('/tracker', { viewTransition: true }), {
    scope: 'tracker-item',
    allowInInput: false,
    description: 'Back to the board',
    group: 'Tracker',
  });

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
        />
      ) : tracker.isPending ? (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-gutter pt-4" aria-busy="true" aria-label="Loading application">
          <Skeleton className="h-4 w-20" />
          <div className="flex items-center gap-4">
            <Skeleton className="size-10 rounded-sm" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-7 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </div>
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <EmptyState
          variant="page"
          icon={KanbanSquare}
          title={tracker.isError ? "Couldn't load this application." : "This application isn't in your tracker."}
          body={tracker.isError ? errorMessage(tracker.error) : 'It may have been removed, here or in another tab.'}
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
