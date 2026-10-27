/**
 * Pointer-following 3D tilt for the hero panel: rotateX/rotateY from the pointer position, springs
 * back to flat on leave. Mouse only (touch and reduced motion get a static panel).
 */
import { m, useMotionValue, useSpring, useTransform } from 'motion/react';
import type { PointerEvent, ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { usePrefersReducedMotion } from '@kestrel/ui';

export function Tilt({
  children,
  className,
  max = 5,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
}) {
  const reduced = usePrefersReducedMotion();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, { stiffness: 120, damping: 20, mass: 0.6 });
  const sy = useSpring(py, { stiffness: 120, damping: 20, mass: 0.6 });
  const rotateY = useTransform(sx, [0, 1], [-max, max]);
  const rotateX = useTransform(sy, [0, 1], [max, -max]);
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || reduced) return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
    e.currentTarget.style.setProperty('--mk-x', `${((e.clientX - r.left) / r.width) * 100}%`);
    e.currentTarget.style.setProperty('--mk-y', `${((e.clientY - r.top) / r.height) * 100}%`);
  };
  const onLeave = () => {
    px.set(0.5);
    py.set(0.5);
  };
  return (
    <div className="mk-tilt-stage">
      <m.div
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        style={reduced ? undefined : { rotateX, rotateY, transformStyle: 'preserve-3d' }}
        className={cn('will-change-transform', className)}
      >
        {children}
      </m.div>
    </div>
  );
}
