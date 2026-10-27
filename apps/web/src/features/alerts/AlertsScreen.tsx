import { Navigate, useSearchParams } from 'react-router';

import { AlertsList } from './components/AlertsList';

/**
 * Alerts: /alerts, the rule list (DESIGN §6.1, USERFLOW §2/§3.4). Rules are built and edited on
 * their own page (AlertEditorPage: /alerts/new, /alerts/:id). Old links `?new=1` / `?new=starter`
 * redirect there.
 */
export function Component() {
  const [params] = useSearchParams();
  const legacyNew = params.get('new');
  if (legacyNew) {
    return <Navigate to={legacyNew === 'starter' ? '/alerts/new?preset=starter' : '/alerts/new'} replace />;
  }
  return (
    <div data-testid="alerts-page" className="flex flex-col">
      <AlertsList />
    </div>
  );
}
