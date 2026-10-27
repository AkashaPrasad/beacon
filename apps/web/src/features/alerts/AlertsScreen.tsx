import { Navigate, useSearchParams } from 'react-router';

import { AlertsList } from './components/AlertsList';

/**
 * Alerts: /alerts, the rule list (DESIGN §6.1, USERFLOW §2/§3.4). Rules are built and edited on
 * their own page (AlertEditorPage: /alerts/new, /alerts/:id). Deep links redirect there:
 * `?rule=<id>` (worker notification links, WORKER.md "rule test") → /alerts/<id>, and the old
 * `?new=1` / `?new=starter` → /alerts/new.
 */
export function Component() {
  const [params] = useSearchParams();
  const rule = params.get('rule');
  if (rule) return <Navigate to={`/alerts/${encodeURIComponent(rule)}`} replace />;
  const legacyNew = params.get('new');
  if (legacyNew) {
    return (
      <Navigate
        to={legacyNew === 'starter' ? '/alerts/new?preset=starter' : '/alerts/new'}
        replace
      />
    );
  }
  return (
    <div data-testid="alerts-page" className="flex flex-col">
      <AlertsList />
    </div>
  );
}
