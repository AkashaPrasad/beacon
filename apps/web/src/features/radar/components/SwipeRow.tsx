/**
 * Mobile swipe row (DESIGN §6.1 "Mobile swipe rows", MOTION §5.17).
 * Swipe right = Save (`accent-subtle` + Bookmark), swipe left = Hide (`surface-active` + EyeOff).
 * The row tracks the finger (Motion drag, direction-locked so vertical scrolling wins), the action icon
 * grows 0.8 → 1 toward the 30 % threshold and pops with an 8 ms haptic when it is crossed. Release past
 * the threshold (or a 500 px/s fling) commits: the row carries its velocity off-screen and the action
 * runs (with an undo toast). Below it, the row springs back.
 */
import { Bookmark, BookmarkCheck, EyeOff } from 'lucide-react';
import {
  animate,
  m,
  useAnimationControls,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type PanInfo,
} from 'motion/react';
import { useRef, type ReactNode } from 'react';


import { cn } from '@/lib/utils';
import { gestures, springs, tweens, usePrefersReducedMotion } from '@kestrel/ui';

import { crossedThreshold, hapticTick, resolveSwipe, type SwipeAction } from '../lib/swipe';

/** MOTION §5.17: `dragElastic={0.5}` (resistance while the row is held). */
const ELASTIC = 0.5;
/** A committed hide removes the row well within this; otherwise the row springs back. */
const RETURN_AFTER_MS = 700;

export interface SwipeRowProps {
  enabled: boolean;
  saved: boolean;
  onCommit: (action: SwipeAction) => void;
  children: ReactNode;
  className?: string;
}

export function SwipeRow({ enabled, saved, onCommit, children, className }: SwipeRowProps) {
  const x = useMotionValue(0);
  const controls = useAnimationControls();
  const icon = useAnimationControls();
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const crossed = useRef(false);
  const draggedAt = useRef(0);

  const width = () => ref.current?.offsetWidth ?? 360;
  const threshold = () => width() * gestures.swipeCommitRatio;
  /** The row moves at half the finger's speed (resistance), so finger travel = x / ELASTIC. */
  const finger = (value: number) => value / ELASTIC;

  // Reveal layers: only the side being uncovered is visible.
  const saveOpacity = useTransform(x, (v) => (v > 0 ? 1 : 0));
  const hideOpacity = useTransform(x, (v) => (v < 0 ? 1 : 0));
  const iconScale = useTransform(x, (v) => 0.8 + 0.2 * Math.min(1, Math.abs(finger(v)) / threshold()));

  useMotionValueEvent(x, 'change', (value) => {
    const past = crossedThreshold(finger(value), width());
    if (past !== crossed.current) {
      crossed.current = past;
      if (past) {
        hapticTick();
        void icon.start({ scale: [1, 1.15, 1], transition: tweens.count });
      }
    }
  });

  const onDragEnd = (_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    draggedAt.current = performance.now();
    crossed.current = false;
    const action = resolveSwipe({ offsetX: info.offset.x, velocityX: info.velocity.x, width: width() });
    if (!action) {
      void controls.start({ x: 0, transition: springs.release });
      return;
    }
    if (reduced) {
      x.set(0);
      onCommit(action);
      return;
    }
    const direction = action === 'save' ? 1 : -1;
    if (action === 'save') {
      // Save keeps the row: it springs home after the action fires.
      onCommit(action);
      void controls.start({ x: 0, transition: { ...springs.release, velocity: info.velocity.x } });
      return;
    }
    // Hide: the row continues off-screen with its release velocity, then the list collapses it. It
    // stays off-screen until it unmounts; if it is still here a moment later (nothing removed it),
    // it comes home.
    void animate(x, direction * width(), { ...springs.smooth, velocity: info.velocity.x }).then(() => {
      onCommit(action);
      setTimeout(() => {
        if (ref.current?.isConnected) void controls.start({ x: 0, transition: springs.release });
      }, RETURN_AFTER_MS);
    });
  };

  if (!enabled) return <div className={className}>{children}</div>;

  return (
    <div ref={ref} className={cn('relative h-full overflow-hidden', className)}>
      <m.div
        aria-hidden="true"
        style={{ opacity: saveOpacity }}
        className="absolute inset-0 flex items-center gap-2 bg-accent-subtle pl-5 text-accent-subtle-fg"
      >
        <m.span style={{ scale: iconScale }} className="grid place-items-center">
          <m.span animate={icon} className="grid place-items-center">
            {saved ? (
              <BookmarkCheck className="size-5" strokeWidth={1.5} />
            ) : (
              <Bookmark className="size-5" strokeWidth={1.5} />
            )}
          </m.span>
        </m.span>
        <span className="text-small font-medium">{saved ? 'Unsave' : 'Save'}</span>
      </m.div>
      <m.div
        aria-hidden="true"
        style={{ opacity: hideOpacity }}
        className="absolute inset-0 flex items-center justify-end gap-2 bg-surface-active pr-5 text-fg"
      >
        <span className="text-small font-medium">Hide</span>
        <m.span style={{ scale: iconScale }} className="grid place-items-center">
          <m.span animate={icon} className="grid place-items-center">
            <EyeOff className="size-5" strokeWidth={1.5} />
          </m.span>
        </m.span>
      </m.div>
      <m.div
        data-testid="radar-swipe"
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={ELASTIC}
        dragMomentum={false}
        animate={controls}
        style={{ x, touchAction: 'pan-y' }}
        onDragEnd={onDragEnd}
        onClickCapture={(event) => {
          // A drag that ends over the row must not also open it.
          if (performance.now() - draggedAt.current < 250) {
            event.stopPropagation();
            event.preventDefault();
          }
        }}
        className="relative h-full"
      >
        {children}
      </m.div>
    </div>
  );
}
