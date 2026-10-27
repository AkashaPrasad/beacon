import { useEffect, type RefObject } from 'react';

/**
 * Size a scroll container to the rest of the viewport (minus the phone tab bar) without
 * re-rendering: the Kanban board's columns scroll on their own, the page doesn't.
 */
export function useFillViewport(ref: RefObject<HTMLElement | null>, minRem = 20) {
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const apply = () => {
      const top = node.getBoundingClientRect().top + window.scrollY;
      const tabbar = window.matchMedia('(min-width: 768px)').matches ? 0 : 56;
      node.style.height = `max(${minRem}rem, calc(100dvh - ${Math.max(0, top)}px - ${tabbar}px - env(safe-area-inset-bottom, 0px)))`;
    };
    apply();
    window.addEventListener('resize', apply);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(apply) : null;
    if (node.parentElement) ro?.observe(node.parentElement);
    return () => {
      window.removeEventListener('resize', apply);
      ro?.disconnect();
    };
  }, [ref, minRem]);
}
