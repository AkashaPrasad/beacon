import { useSyncExternalStore } from 'react';

const noop = () => () => undefined;

/**
 * False during server rendering and while hydrating prerendered HTML, true afterwards (and on a plain
 * client render). Use it for UI that depends on the client (viewport, theme, storage) so hydration
 * never mismatches.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
