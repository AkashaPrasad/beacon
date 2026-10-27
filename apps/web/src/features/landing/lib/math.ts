/** Small numeric helpers for the scrubbed landing scenes. */
import { useMotionValue } from 'motion/react';
import { useEffect, type RefObject } from 'react';

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
/** Symmetric ease for scrubbed travel (scroll already gives 1:1 control; this only softens the ends). */
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** Deterministic pseudo-random in [0, 1) per (index, salt): same layout on every visit. */
export function rand(index: number, salt: number): number {
  let h = (index + 1) * 374761393 + salt * 668265263;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Element size as motion values (no React render on resize). */
export function useElementSize(ref: RefObject<HTMLElement | null>, fallback = { w: 480, h: 420 }) {
  const w = useMotionValue(fallback.w);
  const h = useMotionValue(fallback.h);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      w.set(entry.contentRect.width);
      h.set(entry.contentRect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, w, h]);
  return { w, h };
}

/**
 * Pads a scroll-linked range so it starts at 0 and ends at 1. Motion runs opacity/transform maps of
 * `scrollYProgress` on the browser's ScrollTimeline, where a keyframe list that stops short of 0 or 1
 * falls back to the element's underlying value (a faded headline would reappear past the range).
 */
export function fullRange(input: readonly number[], output: readonly number[]): [number[], number[]] {
  const i = [...input];
  const o = [...output];
  if ((i[0] ?? 0) > 0) {
    i.unshift(0);
    o.unshift(o[0] ?? 0);
  }
  if ((i[i.length - 1] ?? 1) < 1) {
    i.push(1);
    o.push(o[o.length - 1] ?? 0);
  }
  return [i, o];
}
