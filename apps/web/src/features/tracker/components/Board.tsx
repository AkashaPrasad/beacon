import {
  closestCenter,
  defaultDropAnimationSideEffects,
  DndContext,
  DragOverlay,
  getFirstCollision,
  MeasuringStrategy,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { LayoutGroup, m } from 'motion/react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import type { TrackerItemDTO } from '@/api/types';
import { cn } from '@/lib/utils';
import { TRACKER_STAGES, type TrackerStage } from '@kestrel/shared';
import { dragActivation, dropAnimation, springs, usePrefersReducedMotion } from '@kestrel/ui';

import { BoardColumn, ClosedRail } from './BoardColumn';
import { CardFace } from './CardFace';
import { TrackerCard } from './TrackerCard';
import * as say from '../lib/announcements';
import {
  buildColumns,
  columnCounts,
  describeMove,
  keyboardDrag,
  locate,
  moveItem,
  neighbourId,
  type BoardColumns,
  type BoardLocation,
  type Direction,
  type KeyboardDrag,
  type KeyboardDragEvent,
} from '../lib/board';
import type { Nudge } from '../lib/nudges';
import {
  ACTIVE_STAGES,
  COLUMNS,
  isClosedStage,
  closedTotal,
  STAGE_LABEL,
  type ClosedStage,
} from '../lib/stages';
import { useFillViewport } from '../lib/use-fill-viewport';

export type MoveVia = 'drag' | 'keyboard' | 'menu';

export interface BoardProps {
  /** The horizontal scroller (the tracker view remembers its position for Back). */
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  items: TrackerItemDTO[];
  nudges: ReadonlyMap<string, Nudge>;
  now: Date;
  /** The stage shown when "Closed" is unfolded. */
  closedStage: ClosedStage;
  onClosedStageChange: (stage: ClosedStage) => void;
  closedOpen: boolean;
  onClosedOpenChange: (open: boolean) => void;
  onOpen: (id: string) => void;
  onMove: (item: TrackerItemDTO, to: BoardLocation, origin: BoardLocation, via: MoveVia) => void;
  onRemove: (item: TrackerItemDTO) => void;
  onAdd: (stage: TrackerStage) => void;
}

const ARROWS: Partial<Record<string, Direction>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

const visibleOrder = (closed: ClosedStage, open: boolean): TrackerStage[] =>
  open ? [...ACTIVE_STAGES, closed] : [...ACTIVE_STAGES];

const containerStage = (columns: BoardColumns, id: string): TrackerStage | null => {
  if (id.startsWith('col:') || id.startsWith('seg:')) return id.slice(4) as TrackerStage;
  return locate(columns, id)?.stage ?? null;
};
const isContainer = (id: UniqueIdentifier) => /^(col|seg):/.test(String(id));

interface PointerDrag {
  id: string;
  origin: BoardLocation;
  columns: BoardColumns;
}

/**
 * Kanban board (DESIGN §10.4, MOTION §5.10). Pointer and touch drags use dnd-kit (multi-container
 * sortable, `DragOverlay` with the shared drop spring, auto-scroll); the keyboard model is ours and
 * pure (`keyboardDrag`): Space lifts, arrows move one slot (cards travel with Motion layout),
 * Space/Enter drops, Esc cancels, every step announced. Columns are one roving tab stop.
 */
export function Board({
  scrollRef: externalScrollRef,
  items,
  nudges,
  now,
  closedStage,
  onClosedStageChange,
  closedOpen,
  onClosedOpenChange,
  onOpen,
  onMove,
  onRemove,
  onAdd,
}: BoardProps) {
  const reduced = usePrefersReducedMotion();
  const instructionsId = useId();
  const ownScrollRef = useRef<HTMLDivElement>(null);
  const scrollRef = externalScrollRef ?? ownScrollRef;
  useFillViewport(scrollRef);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const serverColumns = useMemo(() => buildColumns(items), [items]);

  // The board to show between a drop and the optimistic cache update (no one-frame snap back).
  const [override, setOverride] = useState<BoardColumns | null>(null);
  const [overrideFor, setOverrideFor] = useState(items);
  if (overrideFor !== items) {
    setOverrideFor(items);
    if (override) setOverride(null);
  }

  const [pointer, setPointer] = useState<PointerDrag | null>(null);
  const [settling, setSettling] = useState(false);
  const [kbd, setKbd] = useState<KeyboardDrag | null>(null);
  const [overStage, setOverStage] = useState<TrackerStage | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [flash, setFlash] = useState<Partial<Record<TrackerStage, number>>>({});
  const [announcement, setAnnouncement] = useState({ text: '', n: 0 });

  const columns = kbd?.columns ?? pointer?.columns ?? override ?? serverColumns;
  const counts = useMemo(() => columnCounts(columns), [columns]);
  const visible = useMemo(() => visibleOrder(closedStage, closedOpen), [closedStage, closedOpen]);

  /** Show a stage behind "Closed" (unfolding it when needed). */
  const revealClosed = useCallback(
    (stage: TrackerStage) => {
      if (!isClosedStage(stage)) return;
      onClosedStageChange(stage);
      onClosedOpenChange(true);
    },
    [onClosedStageChange, onClosedOpenChange],
  );

  const activeLocation = activeId ? locate(columns, activeId) : null;
  const tabbableId =
    activeLocation && visible.includes(activeLocation.stage)
      ? activeId
      : (visible.map((s) => columns[s][0]).find(Boolean) ?? null);

  // Latest values for stable event handlers (read only inside events, never during render).
  const latest = useRef({ columns, visible, byId, kbd, pointer });
  useLayoutEffect(() => {
    latest.current = { columns, visible, byId, kbd, pointer };
  });

  // Focus follows a card that moved (it remounts in its new column).
  const pendingFocus = useRef<{ id: string; stage: TrackerStage } | null>(null);
  useLayoutEffect(() => {
    const want = pendingFocus.current;
    if (!want) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(
      `[data-testid="tracker-card"][data-item-id="${window.CSS.escape(want.id)}"]`,
    );
    if (el && el.dataset.stage === want.stage) {
      pendingFocus.current = null;
      if (document.activeElement !== el) el.focus({ preventScroll: true });
      el.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: reduced ? 'auto' : 'smooth',
      });
    }
  });

  const announce = useCallback(
    (text: string) => setAnnouncement((a) => ({ text, n: a.n + 1 })),
    [],
  );
  const flashColumn = useCallback(
    (stage: TrackerStage) => setFlash((f) => ({ ...f, [stage]: (f[stage] ?? 0) + 1 })),
    [],
  );

  const focusCard = useCallback((id: string) => {
    const stage = locate(latest.current.columns, id)?.stage;
    if (!stage) return;
    pendingFocus.current = { id, stage };
    setActiveId(id);
    const el = scrollRef.current?.querySelector<HTMLElement>(
      `[data-testid="tracker-card"][data-item-id="${window.CSS.escape(id)}"]`,
    );
    if (el) {
      pendingFocus.current = null;
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, []);

  // ── Keyboard drag ─────────────────────────────────────────────────────────────────────────
  const kbdRef = useRef<KeyboardDrag | null>(null);
  const dispatchKbd = useCallback(
    (event: KeyboardDragEvent) => {
      const id = event.type === 'lift' ? event.id : (kbdRef.current?.id ?? '');
      const result = keyboardDrag(kbdRef.current, event, TRACKER_STAGES);
      kbdRef.current = result.state;
      setKbd(result.state);
      const outcome = result.outcome;
      if (!outcome) return;
      const item = latest.current.byId.get(id);
      const total = (stage: TrackerStage) => outcome.columns[stage].length;
      switch (outcome.kind) {
        case 'lifted':
          setActiveId(id);
          announce(
            say.pickedUp(
              item?.title ?? 'card',
              outcome.from.stage,
              outcome.from.index,
              total(outcome.from.stage),
            ),
          );
          break;
        case 'moved':
          revealClosed(outcome.to.stage);
          pendingFocus.current = { id, stage: outcome.to.stage };
          announce(say.movedTo(outcome.to.stage, outcome.to.index, total(outcome.to.stage)));
          break;
        case 'blocked':
          if (event.type === 'move') announce(say.blocked(event.direction));
          break;
        case 'dropped': {
          const moved = describeMove(outcome.from, outcome.to) !== 'none';
          announce(say.droppedIn(outcome.to.stage, moved));
          pendingFocus.current = { id, stage: outcome.to.stage };
          if (moved && item) {
            setOverride(outcome.columns);
            flashColumn(outcome.to.stage);
            onMove(item, outcome.to, outcome.from, 'keyboard');
          }
          break;
        }
        case 'cancelled':
          revealClosed(outcome.to.stage);
          pendingFocus.current = { id, stage: outcome.to.stage };
          announce(say.cancelled(outcome.to.stage));
          break;
      }
    },
    [announce, flashColumn, revealClosed, onMove],
  );

  // A pointer press anywhere else puts a lifted card back.
  useEffect(() => {
    if (!kbd) return undefined;
    const onPointerDown = (e: PointerEvent) => {
      const target =
        e.target instanceof Element ? e.target.closest('[data-testid="tracker-card"]') : null;
      if (target?.getAttribute('data-item-id') !== kbdRef.current?.id)
        dispatchKbd({ type: 'cancel' });
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [kbd, dispatchKbd]);

  const onCardKeyDown = useCallback(
    (item: TrackerItemDTO, e: KeyboardEvent<HTMLLIElement>) => {
      if (e.target !== e.currentTarget || e.metaKey || e.ctrlKey || e.altKey) return;
      const { columns: cols, visible: vis, kbd: lifted, pointer: dragging } = latest.current;
      if (dragging) return;
      const direction = ARROWS[e.key];
      if (lifted) {
        if (direction) {
          e.preventDefault();
          dispatchKbd({ type: 'move', direction });
        } else if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          dispatchKbd({ type: 'drop' });
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          dispatchKbd({ type: 'cancel' });
        } else if (e.key === 'Tab') {
          e.preventDefault();
        }
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        dispatchKbd({ type: 'lift', id: item.id, columns: cols });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onOpen(item.id);
      } else if (direction) {
        e.preventDefault();
        const next = neighbourId(cols, item.id, direction, vis);
        if (next) focusCard(next);
      } else if (e.key === 'Home' || e.key === 'End') {
        const at = locate(cols, item.id);
        const list = at ? cols[at.stage] : [];
        const next = e.key === 'Home' ? list[0] : list[list.length - 1];
        if (next) {
          e.preventDefault();
          focusCard(next);
        }
      }
    },
    [dispatchKbd, focusCard, onOpen],
  );

  const onCardFocus = useCallback((id: string) => setActiveId(id), []);

  const onMenuMove = useCallback(
    (item: TrackerItemDTO, stage: TrackerStage) => {
      const origin = locate(latest.current.columns, item.id);
      if (!origin || origin.stage === stage) return;
      const to = { stage, index: 0 };
      const next = moveItem(latest.current.columns, item.id, stage, 0);
      setOverride(next);
      revealClosed(stage);
      pendingFocus.current = { id: item.id, stage };
      flashColumn(stage);
      announce(`Moved ${item.title} to ${STAGE_LABEL[stage]}.`);
      onMove(item, to, origin, 'menu');
    },
    [announce, flashColumn, revealClosed, onMove],
  );

  // ── Pointer / touch drag (dnd-kit) ────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: dragActivation.pointer }),
    useSensor(TouchSensor, { activationConstraint: dragActivation.touch }),
  );
  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const movedToNewContainer = useRef(false);
  const ignoreClick = useRef(false);
  const shouldIgnoreClick = useCallback(() => ignoreClick.current, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      movedToNewContainer.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [pointer]);

  const collisionDetection: CollisionDetection = useCallback((args) => {
    const drag = latest.current.pointer;
    if (!drag) return [];
    const pointerHits = pointerWithin(args);
    const hits = pointerHits.length > 0 ? pointerHits : rectIntersection(args);
    const segment = hits.find((h) => String(h.id).startsWith('seg:'));
    if (segment) {
      lastOverId.current = segment.id;
      return [segment];
    }
    const card = hits.find((h) => !isContainer(h.id));
    let overId = card?.id ?? getFirstCollision(hits, 'id');
    if (overId != null) {
      if (isContainer(overId)) {
        const stage = String(overId).slice(4) as TrackerStage;
        const ids = drag.columns[stage];
        if (ids.length > 0) {
          const nearest = closestCenter({
            ...args,
            droppableContainers: args.droppableContainers.filter(
              (c) => c.id !== overId && ids.includes(String(c.id)),
            ),
          })[0]?.id;
          if (nearest != null) overId = nearest;
        }
      }
      lastOverId.current = overId;
      return [{ id: overId }];
    }
    if (movedToNewContainer.current) lastOverId.current = drag.id;
    return lastOverId.current ? [{ id: lastOverId.current }] : [];
  }, []);

  const onDragStart = ({ active }: DragStartEvent) => {
    if (kbdRef.current) dispatchKbd({ type: 'cancel' });
    const id = String(active.id);
    const origin = locate(columns, id);
    if (!origin) return;
    lastOverId.current = null;
    const drag = { id, origin, columns };
    latest.current = { ...latest.current, pointer: drag };
    setPointer(drag);
    setOverStage(origin.stage);
    setActiveId(id);
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const activeKey = String(active.id);
    const overKey = String(over.id);
    if (overKey.startsWith('seg:')) {
      const stage = overKey.slice(4) as ClosedStage;
      if (stage !== closedStage || !closedOpen) revealClosed(stage);
    }
    const drag = latest.current.pointer;
    if (!drag) return;
    const from = locate(drag.columns, activeKey);
    const toStage = containerStage(drag.columns, overKey);
    if (!from || !toStage) return;
    setOverStage(toStage);
    if (from.stage === toStage) return;
    const target = drag.columns[toStage];
    let index = target.length;
    if (!isContainer(overKey)) {
      const overIndex = target.indexOf(overKey);
      const translated = active.rect.current.translated;
      const below = translated ? translated.top > over.rect.top + over.rect.height / 2 : false;
      index = overIndex >= 0 ? overIndex + (below ? 1 : 0) : target.length;
    }
    movedToNewContainer.current = true;
    const next = { ...drag, columns: moveItem(drag.columns, activeKey, toStage, index) };
    latest.current = { ...latest.current, pointer: next, columns: next.columns };
    setPointer(next);
  };

  const finishPointer = () => {
    setPointer(null);
    setOverStage(null);
    ignoreClick.current = true;
    setTimeout(() => {
      ignoreClick.current = false;
    }, 0);
    // Let dnd-kit settle the drop before Motion layout takes over again.
    setSettling(true);
    setTimeout(() => setSettling(false), 260);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const drag = latest.current.pointer;
    const id = String(active.id);
    finishPointer();
    if (!drag || !over) return;
    let final = drag.columns;
    const at = locate(final, id);
    const overKey = String(over.id);
    if (at && !isContainer(overKey) && overKey !== id) {
      const overAt = locate(final, overKey);
      if (overAt && overAt.stage === at.stage) final = moveItem(final, id, at.stage, overAt.index);
    }
    const to = locate(final, id);
    const item = byId.get(id);
    if (!to || !item || describeMove(drag.origin, to) === 'none') return;
    setOverride(final);
    if (to.stage !== drag.origin.stage) flashColumn(to.stage);
    onMove(item, to, drag.origin, 'drag');
  };

  const onDragCancel = () => {
    const drag = latest.current.pointer;
    finishPointer();
    if (drag) revealClosed(drag.origin.stage);
  };

  const accessibility = useMemo(
    () => ({
      screenReaderInstructions: { draggable: say.DRAG_INSTRUCTIONS },
      announcements: {
        onDragStart: ({ active }: { active: { id: UniqueIdentifier } }) => {
          const cols = latest.current.columns;
          const at = locate(cols, String(active.id));
          const item = latest.current.byId.get(String(active.id));
          return at
            ? say.pickedUp(item?.title ?? 'card', at.stage, at.index, cols[at.stage].length)
            : undefined;
        },
        onDragOver: ({
          active,
          over,
        }: {
          active: { id: UniqueIdentifier };
          over: { id: UniqueIdentifier } | null;
        }) => {
          const drag = latest.current.pointer;
          if (!over || !drag) return undefined;
          const at = locate(drag.columns, String(active.id));
          return at ? say.movedTo(at.stage, at.index, drag.columns[at.stage].length) : undefined;
        },
        onDragEnd: ({
          active,
          over,
        }: {
          active: { id: UniqueIdentifier };
          over: { id: UniqueIdentifier } | null;
        }) => {
          const drag = latest.current.pointer;
          const at = drag ? locate(drag.columns, String(active.id)) : null;
          if (!over || !at || !drag) return drag ? say.cancelled(drag.origin.stage) : undefined;
          return say.droppedIn(at.stage, describeMove(drag.origin, at) !== 'none');
        },
        onDragCancel: () => {
          const drag = latest.current.pointer;
          return drag ? say.cancelled(drag.origin.stage) : undefined;
        },
      },
    }),
    [],
  );

  const drop: DropAnimation | null = reduced
    ? null
    : {
        duration: dropAnimation.duration,
        easing: dropAnimation.easing,
        sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }),
      };

  const pointerDragging = pointer !== null || settling;
  const overlayItem = pointer ? byId.get(pointer.id) : undefined;

  return (
    <LayoutGroup id="tracker-board">
      <ColumnStrip columns={counts} closedStage={closedStage} scrollRef={scrollRef} />
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        autoScroll={{ threshold: { x: 0.08, y: 0.15 }, acceleration: 12 }}
        accessibility={accessibility}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <m.div
          ref={scrollRef}
          layoutScroll
          role="region"
          aria-label="Board"
          data-testid="tracker-board"
          data-dragging={pointer ? 'pointer' : kbd ? 'keyboard' : undefined}
          className="flex snap-x snap-mandatory scroll-px-gutter gap-3 overflow-x-auto overscroll-x-contain px-gutter pt-1 pb-4 [scrollbar-width:thin] md:snap-none"
        >
          {COLUMNS.map((column) => {
            if (column.key === 'closed' && !closedOpen) {
              return (
                <ClosedRail
                  key={column.key}
                  counts={counts}
                  isOver={pointer !== null && overStage !== null && isClosedStage(overStage)}
                  pointerDragging={pointer !== null}
                  onOpen={revealClosed}
                />
              );
            }
            const stage = column.key === 'closed' ? closedStage : column.key;
            return (
              <BoardColumn
                key={column.key}
                column={column}
                stage={stage}
                ids={columns[stage]}
                counts={counts}
                isOver={pointer !== null && overStage === stage}
                pointerDragging={pointer !== null}
                keyboardDragging={kbd !== null}
                flash={flash[stage] ?? 0}
                onAdd={onAdd}
                onClosedStageChange={onClosedStageChange}
                onCollapse={column.key === 'closed' ? () => onClosedOpenChange(false) : undefined}
              >
                {columns[stage].map((id) => {
                  const item = byId.get(id);
                  if (!item) return null;
                  return (
                    <TrackerCard
                      key={id}
                      item={item}
                      stage={stage}
                      nudge={nudges.get(id) ?? null}
                      now={now}
                      tabbable={id === tabbableId}
                      lifted={kbd?.id === id}
                      pointerDragging={pointerDragging}
                      keyboardDragging={kbd !== null}
                      instructionsId={instructionsId}
                      onKeyDown={onCardKeyDown}
                      onFocus={onCardFocus}
                      onOpen={onOpen}
                      onMove={onMenuMove}
                      onRemove={onRemove}
                      shouldIgnoreClick={shouldIgnoreClick}
                    />
                  );
                })}
              </BoardColumn>
            );
          })}
        </m.div>
        <DragOverlay dropAnimation={drop}>
          {overlayItem ? (
            <m.div
              initial={{ scale: 1 }}
              animate={{ scale: reduced ? 1 : 1.03, transition: springs.snappy }}
              className="relative cursor-grabbing rounded-md border border-border-strong bg-surface-raised p-card shadow-lg"
            >
              <CardFace item={overlayItem} nudge={nudges.get(overlayItem.id) ?? null} now={now} />
            </m.div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <p id={instructionsId} hidden>
        {say.DRAG_INSTRUCTIONS}
      </p>
      <div
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
        data-testid="tracker-announcer"
      >
        <span key={announcement.n}>{announcement.text}</span>
      </div>
    </LayoutGroup>
  );
}

/** Phones: a status strip that scrolls the board to a column (DESIGN §10.4 mobile). */
function ColumnStrip({
  columns,
  closedStage,
  scrollRef,
}: {
  columns: Record<TrackerStage, number>;
  closedStage: ClosedStage;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [active, setActive] = useState<string>('saved');
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || typeof IntersectionObserver !== 'function') return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        const best = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const key = best?.target.getAttribute('data-column');
        if (key) setActive(key);
      },
      { root, threshold: [0.6] },
    );
    root.querySelectorAll('[data-testid="tracker-column"]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [scrollRef]);
  return (
    <nav
      aria-label="Columns"
      className="flex gap-1 overflow-x-auto px-gutter pb-2 [scrollbar-width:none] md:hidden"
    >
      {COLUMNS.map((c) => {
        const count = c.key === 'closed' ? closedTotal(columns) : columns[c.key];
        const on = active === c.key;
        return (
          <button
            key={c.key}
            type="button"
            aria-current={on ? 'true' : undefined}
            onClick={() =>
              scrollRef.current
                ?.querySelector(`[data-column="${c.key}"]`)
                ?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })
            }
            className={cn(
              'press inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-small whitespace-nowrap focus-visible:focus-ring',
              on ? 'bg-surface-active text-fg' : 'text-fg-secondary',
            )}
          >
            {c.key === 'closed' ? `Closed · ${STAGE_LABEL[closedStage]}` : c.label}
            <span className="font-mono text-mono-sm text-fg-tertiary">{count}</span>
          </button>
        );
      })}
    </nav>
  );
}
