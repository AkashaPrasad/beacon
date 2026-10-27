// Spotlight tour for the Radar: `<SpotlightTour />` (mount once on /radar) and `useTour()` (start/stop
// from menus: "Show me around"). See docs/ONBOARDING.md §4.
export { SpotlightTour, useTour } from './SpotlightTour';
export { TOUR_STOPS, resolveAnchor, type TourStop } from './steps';
export {
  isTourActive,
  markTourDone,
  requestFirstRunTour,
  requestReplay,
  tourRun,
  tourStatus,
  useTourRun,
} from './tour-store';
