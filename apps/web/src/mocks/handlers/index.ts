/**
 * Every MSW handler, in matching order (docs/WEB.md § Mock API). Used by the browser worker
 * (`VITE_MOCK_API=1`, ../browser.ts) and by Vitest (../server.ts).
 *
 * Order matters: the foundation guard runs first (CSRF, 401 when signed out) and falls through;
 * then each feature's handlers. Screen agents own their `<feature>.ts` module and export
 * `<feature>Handlers` plus a `reset<Feature>Mock()`; add new modules to both lists below.
 * Per-test overrides: `server.use(http.get('*\/v1/feed', …))` (Vitest) or `worker.use(…)`.
 */
import type { HttpHandler } from 'msw';

import { resetFoundationState } from '../state';
import { alertsHandlers, resetAlertsMock } from './alerts';
import { feedHandlers, resetFeedMock } from './feed';
import { foundationHandlers, setResourceHandlers } from './foundation';
import { listingsHandlers } from './listings';
import { notificationsHandlers, resetNotificationsMock } from './notifications';
import { profileHandlers, resetProfileMock } from './profile';
import { resetSettingsMock, settingsHandlers } from './settings';
import { resetSourcesMock, sourcesHandlers } from './sources';
import { resetTrackerMock, trackerHandlers } from './tracker';

/** Resource handlers (everything behind the guard). */
export const resourceHandlers: HttpHandler[] = [
  ...feedHandlers,
  ...listingsHandlers,
  ...profileHandlers,
  ...settingsHandlers,
  ...notificationsHandlers,
  ...sourcesHandlers,
  ...alertsHandlers,
  ...trackerHandlers,
];

setResourceHandlers(resourceHandlers);

export const handlers: HttpHandler[] = [...foundationHandlers, ...resourceHandlers];

/** Reset every mock store to its scenario's seed (call between tests). */
export function resetMocks(): void {
  resetFoundationState();
  resetFeedMock();
  resetProfileMock();
  resetSettingsMock();
  resetNotificationsMock();
  resetSourcesMock();
  resetAlertsMock();
  resetTrackerMock();
}
