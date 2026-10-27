// @kestrel/ui public surface. Presentational, router-free and data-free: safe to SSR and to use from
// any app. App-specific compositions (tooltips, menus, data hooks) live in apps/web/src/components.
export { cn } from './cn';
export * from './motion';

export * from './fit';
export * from './format';
export * from './deadline';
export { usePrefersReducedMotion, useNow, useDelayedTrue, useIsApple } from './hooks';

export { FitRing, type FitRingProps, type FitRingSize } from './FitRing';
export { resetFitRingSession } from './fit-session';
export { Kbd, KbdGroup, Shortcut } from './Kbd';
export { keyLabel } from './keys';
export { Skeleton, ListSkeleton, CardSkeleton, TableSkeleton } from './Skeleton';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { PageHeader, type PageHeaderProps } from './PageHeader';
export { TypeBadge, type TypeBadgeProps } from './TypeBadge';
export { TYPE_META, type OpportunityTypeKey } from './types';
export { GhostRiskBadge, type GhostRiskBadgeProps } from './GhostRiskBadge';
export { GHOST_META, ghostLevelOf, type GhostRiskLevelKey } from './ghost';
export { DeadlineCountdown, type DeadlineCountdownProps } from './DeadlineCountdown';
export { CompanyLogo, type CompanyLogoProps, type CompanyLogoSize } from './CompanyLogo';
export { isResolvableDomain, hashString } from './logo';
