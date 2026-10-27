import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react';

const noopSubscribe = () => () => undefined;

/** False on the server and while hydrating prerendered HTML; true on the client right after. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/**
 * Becomes true (once) when the element comes within `margin` of the viewport. Scene code is
 * fetched then (MOTION §10: lazy when the section is within one viewport). Server and first client
 * render are both false, so hydration never mismatches.
 */
export function useNearViewport(ref: RefObject<Element | null>, margin = '100% 0px'): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || near || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: margin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, margin, near]);
  return near;
}

function subscribeVisibility(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

/** False while the tab is hidden (every looping scene pauses, MOTION §8). */
export function usePageVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState !== 'hidden',
    () => true,
  );
}
