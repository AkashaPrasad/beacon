import { BellOff } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router';

import { useAlerts } from '@/api/alerts';
import { DetailPageHeader } from '@/components/detail-page-header';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { errorMessage } from '@/lib/api';
import { EmptyState, Skeleton } from '@kestrel/ui';

import { RuleEditor } from './components/RuleEditor';
import { pendingDeletesSnapshot, subscribePendingDeletes } from './lib/pending-deletes';
import { emptyDraft, ruleToDraft, starterDraft, type RuleDraft } from './lib/rule-draft';

/** A draft handed over in navigation state (Duplicate, "Edit again" after a failed save). */
function draftFromState(state: unknown): RuleDraft | null {
  const draft = (state as { draft?: Partial<RuleDraft> } | null)?.draft;
  if (
    !draft ||
    typeof draft !== 'object' ||
    !Array.isArray(draft.channels) ||
    !Array.isArray(draft.clauses)
  )
    return null;
  return { ...emptyDraft(), ...draft };
}

/**
 * Alert rule editor: /alerts/new (`?preset=starter` = "Strong fit internships") and /alerts/:id
 * (also reached from notification links `/alerts?rule=<id>`). A full page with Back, not a dialog:
 * the sentence, its plain-language meaning, delivery settings, Save / Cancel, and for an existing
 * rule [Send test], Duplicate and Delete.
 */
export function Component() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const alerts = useAlerts();
  const pendingDeletes = useSyncExternalStore(
    subscribePendingDeletes,
    pendingDeletesSnapshot,
    pendingDeletesSnapshot,
  );

  let body;
  if (!id) {
    const draft =
      draftFromState(location.state) ??
      (params.get('preset') === 'starter' ? starterDraft() : emptyDraft());
    body = <RuleEditor key={`new-${location.key}`} rule={null} initialDraft={draft} />;
  } else {
    const rule = alerts.data?.find((r) => r.id === id && !pendingDeletes.has(r.id));
    if (rule) {
      body = <RuleEditor key={rule.id} rule={rule} initialDraft={ruleToDraft(rule)} />;
    } else if (alerts.isPending) {
      // Same boxes as the editor: header, sentence card, preview line, delivery group.
      body = (
        <div className="mx-auto flex w-full max-w-3xl flex-col">
          <DetailPageHeader
            parent={{ label: 'Alerts', to: '/alerts' }}
            title="Alert rule"
            hideTitle
          />
          <div role="status" aria-busy="true" className="flex flex-col gap-6 px-gutter pt-1">
            <span className="sr-only">Loading the rule</span>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-80 max-w-full" />
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-40 w-full rounded-lg" />
          </div>
        </div>
      );
    } else {
      body = (
        <div className="mx-auto flex w-full max-w-3xl flex-col">
          <DetailPageHeader
            parent={{ label: 'Alerts', to: '/alerts' }}
            title="Alert rule"
            hideTitle
          />
          <EmptyState
            variant="page"
            icon={BellOff}
            title={alerts.isError ? "Couldn't load this rule." : 'This alert rule is gone.'}
            body={
              alerts.isError
                ? errorMessage(alerts.error)
                : 'It may have been deleted on another device.'
            }
            action={
              alerts.isError ? (
                <Button variant="secondary" onClick={() => void alerts.refetch()}>
                  Retry
                </Button>
              ) : (
                <Button asChild variant="secondary">
                  <Link to="/alerts">Back to Alerts</Link>
                </Button>
              )
            }
          />
        </div>
      );
    }
  }

  return (
    <TooltipProvider>
      <div data-testid="alert-editor-page" className="flex flex-col pb-8">
        {body}
      </div>
    </TooltipProvider>
  );
}
