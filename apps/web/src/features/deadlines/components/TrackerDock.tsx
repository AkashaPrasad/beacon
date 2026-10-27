/**
 * "Drop here to track" dock (DESIGN §10.3): shown only while a pill is being dragged, at the bottom of
 * the viewport (above the mobile tab bar). It rises in on `springs.snappy`; while a pill is over it,
 * the dock takes the `accent-subtle` fill so the target is unmistakable.
 */
import { useDroppable } from '@dnd-kit/core';
import { KanbanSquare } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';

import { cn } from '@/lib/utils';
import { springs, tweens } from '@kestrel/ui';

export const TRACKER_DOCK_ID = 'tracker-dock';

export function TrackerDock({ active, title }: { active: boolean; title: string | null }) {
  const { setNodeRef, isOver } = useDroppable({ id: TRACKER_DOCK_ID });
  return (
    <AnimatePresence>
      {active && (
        <m.div
          key="dock"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0, transition: springs.snappy }}
          exit={{ opacity: 0, y: 8, transition: tweens.exit }}
          className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar-h)+var(--safe-bottom)+1rem)] z-popover flex justify-center px-gutter md:bottom-6"
        >
          <div
            ref={setNodeRef}
            data-testid="deadlines-dock"
            data-over={isOver || undefined}
            className={cn(
              'pointer-events-auto flex h-14 w-full max-w-xl items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 text-small shadow-lg',
              'transition-colors duration-fast ease-out',
              isOver
                ? 'border-accent-strong bg-accent-subtle text-accent-subtle-fg'
                : 'border-border-strong bg-overlay text-fg-secondary',
            )}
          >
            <KanbanSquare className="size-5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            <span className="truncate">
              {isOver ? 'Release to add to your tracker' : 'Drop here to track'}
              {title ? <span className="sr-only">: {title}</span> : null}
            </span>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
