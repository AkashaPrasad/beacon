import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { m } from 'motion/react';
import { memo, useId, useRef, useState, type KeyboardEvent } from 'react';

import type { TrackerItemDTO } from '@/api/types';
import { cn } from '@/lib/utils';
import type { TrackerStage } from '@kestrel/shared';
import { cssSpring, layoutIds, MOTION_LIMITS, springs, usePrefersReducedMotion } from '@kestrel/ui';

import { CardFace } from './CardFace';
import { MoveToMenu } from './MoveToMenu';
import { ageSentence } from '../lib/card';
import { nudgeLabel, type Nudge } from '../lib/nudges';
import { STAGE_LABEL } from '../lib/stages';

export interface TrackerCardProps {
  item: TrackerItemDTO;
  /** The column the card is in right now (differs from `item.stage` while it is being moved). */
  stage: TrackerStage;
  nudge: Nudge | null;
  now: Date;
  /** Roving tab stop: exactly one card on the board is tabbable. */
  tabbable: boolean;
  /** Picked up with the keyboard (Space). */
  lifted: boolean;
  /** A pointer drag is running somewhere on the board: Motion layout yields to dnd-kit transforms. */
  pointerDragging: boolean;
  /** A keyboard drag is running: pointer dragging is off. */
  keyboardDragging: boolean;
  instructionsId: string;
  onKeyDown: (item: TrackerItemDTO, event: KeyboardEvent<HTMLLIElement>) => void;
  onFocus: (id: string) => void;
  onOpen: (id: string) => void;
  onMove: (item: TrackerItemDTO, stage: TrackerStage) => void;
  onRemove: (item: TrackerItemDTO) => void;
  /** Ignore the click that ends a pointer drag. */
  shouldIgnoreClick: () => boolean;
}

/**
 * Sortable Kanban card. The `li` is the focus target, keyboard handler and drag activator (testid
 * `tracker-card`, `data-item-id`, `data-stage`) and carries Motion layout (cards travel between
 * columns with a shared `layoutId`); the inner box is dnd-kit's measured node, so sortable
 * transforms and Motion never write the same transform.
 */
export const TrackerCard = memo(function TrackerCard({
  item,
  stage,
  nudge,
  now,
  tabbable,
  lifted,
  pointerDragging,
  keyboardDragging,
  instructionsId,
  onKeyDown,
  onFocus,
  onOpen,
  onMove,
  onRemove,
  shouldIgnoreClick,
}: TrackerCardProps) {
  const titleId = useId();
  const metaId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const reduced = usePrefersReducedMotion();
  const optimistic = item.id.startsWith('optimistic-');
  const { setNodeRef, setActivatorNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { stage },
    disabled: keyboardDragging || optimistic,
    transition: { duration: 180, easing: cssSpring },
  });

  const liRef = useRef<HTMLLIElement | null>(null);
  const layoutOn = !pointerDragging && !reduced;
  const focusSelf = () => liRef.current?.focus({ preventScroll: true });

  return (
    <m.li
      ref={(node: HTMLLIElement | null) => {
        liRef.current = node;
        setActivatorNodeRef(node);
      }}
      {...listeners}
      data-testid="tracker-card"
      data-item-id={item.id}
      data-stage={stage}
      data-lifted={lifted || undefined}
      data-pending={optimistic || undefined}
      tabIndex={tabbable ? 0 : -1}
      aria-labelledby={titleId}
      aria-describedby={`${metaId} ${instructionsId}`}
      aria-roledescription="Draggable card"
      aria-keyshortcuts="Space M Enter"
      layout={layoutOn ? 'position' : false}
      layoutId={layoutOn ? layoutIds.trackerCard(item.id) : undefined}
      initial={optimistic && !reduced ? { opacity: 0, y: MOTION_LIMITS.distanceSm } : false}
      animate={{ opacity: 1, y: 0, scale: lifted && !reduced ? 1.03 : 1 }}
      whileHover={pointerDragging || lifted ? undefined : { y: MOTION_LIMITS.liftY, transition: springs.lift }}
      transition={{ layout: springs.gentle, scale: springs.snappy, default: springs.gentle }}
      onKeyDown={(e) => {
        // `m`: Move to… (the single-pointer alternative, DESIGN §9).
        if (e.key.toLowerCase() === 'm' && !lifted && !e.metaKey && !e.ctrlKey && !e.altKey && e.target === e.currentTarget) {
          e.preventDefault();
          setMenuOpen(true);
          return;
        }
        onKeyDown(item, e);
      }}
      onFocus={(e) => {
        if (e.target === e.currentTarget) onFocus(item.id);
      }}
      onClick={() => {
        if (shouldIgnoreClick()) return;
        onOpen(item.id);
      }}
      onContextMenu={(e) => {
        // Long-press on touch starts a drag, never the system callout.
        if ((e.nativeEvent as PointerEvent).pointerType === 'touch') e.preventDefault();
      }}
      className={cn(
        'group/card relative list-none rounded-md outline-none select-none [-webkit-touch-callout:none] [touch-action:manipulation]',
        'cursor-grab focus-visible:focus-ring data-[lifted]:z-raised data-[lifted]:cursor-grabbing',
      )}
    >
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Translate.toString(transform), transition }}
        className={cn(
          'relative rounded-md border bg-surface-raised p-card transition-[border-color,opacity] duration-fast',
          'after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:opacity-0 after:transition-opacity after:duration-fade',
          lifted ? 'border-border-strong after:opacity-100 after:shadow-lg' : 'border-border after:shadow-md',
          !lifted && !pointerDragging && 'group-hover/card:border-border-strong group-hover/card:after:opacity-100',
          isDragging && 'opacity-40',
          optimistic && 'opacity-80',
        )}
      >
        <CardFace item={item} nudge={nudge} now={now} titleId={titleId} metaId={metaId} />
        <span className="sr-only">
          {`${STAGE_LABEL[stage]}. ${ageSentence(item, now)}.${nudge ? ` ${nudgeLabel(nudge)}.` : ''}`}
        </span>
        <div
          className={cn(
            'absolute top-1.5 right-1.5 transition-opacity duration-fast',
            menuOpen
              ? 'opacity-100'
              : '[@media(hover:hover)]:opacity-0 group-hover/card:opacity-100 group-focus-visible/card:opacity-100',
          )}
        >
          <MoveToMenu
            item={item}
            open={menuOpen}
            onOpenChange={setMenuOpen}
            onMove={(stage) => onMove(item, stage)}
            onOpenDetails={() => onOpen(item.id)}
            onRemove={() => onRemove(item)}
            onRestoreFocus={focusSelf}
          />
        </div>
      </div>
    </m.li>
  );
});
