import { EmptyState, Skeleton } from '@kestrel/ui';
import { BellOff } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router';

import { useAlerts } from '@/api/alerts';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { errorMessage } from '@/lib/api';

import { RuleEditor } from './components/RuleEditor';
import { pendingDeletesSnapshot, subscribePendingDeletes } from './lib/pending-deletes';
import { emptyDraft, ruleToDraft, starterDraft, type RuleDraft } from './lib/rule-draft';

/** A draft handed over in navigation state (Duplicate, "Edit again" after a failed save). */
function draftFromState(state: unknown): RuleDraft | null {
  const draft = (state as { draft?: Partial<RuleDraft> } | null)?.draft;
  if (!draft || typeof draft !== 'object' || !Array.isArray(draft.channels) || !Array.isArray(draft.clauses)) return null;
  return { ...emptyDraft(), ...draft };
}

/**
 * Alert rule editor: /alerts/new (`?preset=starter` = "Strong fit internships") and /alerts/:id.
 * Full page, not a dialog: the sentence, its plain-language meaning, Save / Cancel, and for an
 * existing rule [Send test], Duplicate and Delete.
 */
export function Component() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const alerts = useAlerts();
  const pendingDeletes = useSyncExternalStore(subscribePendingDeletes, pendingDeletesSnapshot, pendingDeletesSnapshot);

  let body;
  if (!id) {
    const draft =
      draftFromState(location.state) ?? (params.get('preset') === 'starter' ? starterDraft() : emptyDraft());
    body = <RuleEditor key={`new-${location.key}`} rule={null} initialDraft={draft} />;
  } else {
    const rule = alerts.data?.find((r) => r.id === id && !pendingDeletes.has(r.id));
    if (rule) {
      body = <RuleEditor key={rule.id} rule={rule} initialDraft={ruleToDraft(rule)} />;
    } else if (alerts.isPending) {
      body = (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-gutter pt-6" aria-busy="true" aria-label="Loading the rule">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-5 w-3/4" />
        </div>
      );
    } else {
      body = (
        <EmptyState
          variant="page"
          icon={BellOff}
          title={alerts.isError ? "Couldn't load this rule." : 'This alert rule is gone.'}
          body={alerts.isError ? errorMessage(alerts.error) : 'It may have been deleted on another device.'}
          action={
            <Button asChild variant="secondary">
              <Link to="/alerts">Back to Alerts</Link>
            </Button>
          }
        />
      );
    }
  }

  return (
    <TooltipProvider>
      <div data-testid="alerts-editor-page" className="flex flex-col">
        {body}
      </div>
    </TooltipProvider>
  );
}
