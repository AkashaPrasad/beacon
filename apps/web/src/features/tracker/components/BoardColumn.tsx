import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ChevronsLeft, ChevronsRight, Plus } from 'lucide-react';
import { m } from 'motion/react';
import { useId, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Ticker } from '@/features/sources/components/common/Ticker';
import { cn } from '@/lib/utils';
import type { TrackerStage } from '@kestrel/shared';
import { press, tweens } from '@kestrel/ui';

import {
  firstClosedStage,
  CLOSED_STAGES,
  closedTotal,
  STAGE_ICONS,
  STAGE_LABEL,
  type ColumnDef,
  type ClosedStage,
} from '../lib/stages';

const columnDroppableId = (stage: TrackerStage) => `col:${stage}`;
const segmentDroppableId = (stage: ClosedStage) => `seg:${stage}`;

const COLUMN_SHELL = cn(
  'relative flex h-full shrink-0 snap-start flex-col rounded-lg bg-surface-sunken',
  'before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-accent-subtle before:opacity-0 before:transition-opacity before:duration-fade',
  'data-[over]:before:opacity-40',
);

/**
 * One Kanban column (DESIGN §10.4): `surface-sunken`, `rounded-lg`, min 272 px; header with the
 * label and a rolling count. The "Closed" column holds Rejected and Ghosted behind a
 * segmented control whose segments are drop targets too. The list scrolls on its own.
 */
export function BoardColumn({
  column,
  stage,
  ids,
  counts,
  isOver,
  pointerDragging,
  keyboardDragging,
  flash,
  onAdd,
  onClosedStageChange,
  onCollapse,
  children,
}: {
  column: ColumnDef;
  /** The stage this column shows now (Closed: the active segment). */
  stage: TrackerStage;
  ids: string[];
  counts: Record<TrackerStage, number>;
  isOver: boolean;
  pointerDragging: boolean;
  /** While a card is lifted with the keyboard the list stops clipping, so the card can travel in. */
  keyboardDragging: boolean;
  /** Increments when a card lands here: the header flashes `accent-subtle` once (MOTION §5.10). */
  flash: number;
  onAdd: (stage: TrackerStage) => void;
  onClosedStageChange: (stage: ClosedStage) => void;
  /** Closed only: fold back into the narrow "Closed" rail. */
  onCollapse?: () => void;
  children: ReactNode;
}) {
  const headingId = useId();
  const { setNodeRef } = useDroppable({ id: columnDroppableId(stage), data: { stage } });
  const closed = column.key === 'closed';
  const total = closed ? closedTotal(counts) : counts[stage];
  const Icon = STAGE_ICONS[closed ? stage : column.stages[0]!];

  return (
    <section
      data-testid="tracker-column"
      data-stage={stage}
      data-column={column.key}
      data-over={isOver || undefined}
      aria-labelledby={headingId}
      className={cn(COLUMN_SHELL, 'w-[min(85vw,20rem)] md:w-68')}
    >
      <header className="relative flex h-11 shrink-0 items-center gap-2 overflow-hidden rounded-t-lg pr-1.5 pl-3">
        {flash > 0 ? (
          <m.span
            key={flash}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-accent-subtle"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0], transition: { ...tweens.count, times: [0, 0.3, 1] } }}
          />
        ) : null}
        <Icon
          className="relative size-4 shrink-0 text-fg-tertiary"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <h2 id={headingId} className="relative truncate text-label text-fg-secondary uppercase">
          {closed ? <span className="sr-only">{`Closed, ${STAGE_LABEL[stage]}`}</span> : null}
          <span aria-hidden={closed || undefined}>{column.label}</span>
        </h2>
        <Ticker
          value={total}
          className="relative text-mono-sm text-fg-tertiary"
          label={`${total} ${total === 1 ? 'card' : 'cards'}`}
        />
        <div className="relative ml-auto flex items-center">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Add to ${STAGE_LABEL[stage]}`}
            onClick={() => onAdd(stage)}
          >
            <Plus strokeWidth={1.5} />
          </Button>
          {closed && onCollapse ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Fold Closed away"
              aria-expanded
              onClick={onCollapse}
            >
              <ChevronsRight strokeWidth={1.5} />
            </Button>
          ) : null}
        </div>
      </header>
      {closed ? (
        <div className="relative px-2 pb-2">
          <ToggleGroup
            type="single"
            segmented
            value={stage}
            onValueChange={(v) => v && onClosedStageChange(v as ClosedStage)}
            aria-label="Closed stages"
            className="w-full"
          >
            {CLOSED_STAGES.map((s) => (
              <SegmentItem key={s} stage={s} count={counts[s]} pointerDragging={pointerDragging} />
            ))}
          </ToggleGroup>
        </div>
      ) : null}
      <SortableContext id={stage} items={ids} strategy={verticalListSortingStrategy}>
        <m.ol
          ref={setNodeRef}
          layoutScroll
          data-testid={`tracker-column-${stage}`}
          aria-labelledby={headingId}
          className={cn(
            'relative flex min-h-24 flex-1 flex-col gap-2 overscroll-contain px-2 pt-1 pb-2 [scrollbar-width:thin]',
            keyboardDragging ? 'overflow-visible' : 'overflow-y-auto',
          )}
        >
          {children}
          {ids.length === 0 ? (
            <li
              className={cn(
                'flex min-h-20 list-none items-center justify-center rounded-md px-3 text-center text-caption text-fg-tertiary',
                pointerDragging && 'border border-dashed border-border-strong',
              )}
            >
              {pointerDragging ? 'Drop here' : `Nothing in ${STAGE_LABEL[stage]} yet.`}
            </li>
          ) : null}
        </m.ol>
      </SortableContext>
    </section>
  );
}

function SegmentItem({
  stage,
  count,
  pointerDragging,
}: {
  stage: ClosedStage;
  count: number;
  pointerDragging: boolean;
}) {
  // Dragging a card over a segment switches to it and drops there.
  const { setNodeRef, isOver } = useDroppable({ id: segmentDroppableId(stage), data: { stage } });
  return (
    <ToggleGroupItem
      ref={setNodeRef}
      value={stage}
      aria-label={`${STAGE_LABEL[stage]}, ${count}`}
      className={cn('px-1.5', pointerDragging && isOver && 'ring-1 ring-accent-strong')}
    >
      {STAGE_LABEL[stage]}
      <span className="font-mono text-mono-sm text-fg-tertiary">{count}</span>
    </ToggleGroupItem>
  );
}

/**
 * "Closed", folded: a narrow 56 px column (desktop) with Rejected and Ghosted as icon + count tiles;
 * click one to unfold on it, or drag a card onto it (the column unfolds under the pointer, like a
 * spring-loaded folder). On phones it is a full-width column in the swipe row with labelled tiles.
 */
export function ClosedRail({
  counts,
  isOver,
  pointerDragging,
  onOpen,
}: {
  counts: Record<TrackerStage, number>;
  isOver: boolean;
  pointerDragging: boolean;
  onOpen: (stage: ClosedStage) => void;
}) {
  const headingId = useId();
  const total = closedTotal(counts);
  return (
    <section
      data-testid="tracker-column"
      data-column="closed"
      data-collapsed="true"
      data-over={isOver || undefined}
      aria-labelledby={headingId}
      className={cn(COLUMN_SHELL, 'w-[min(85vw,20rem)] md:w-14')}
    >
      <header className="relative flex h-11 shrink-0 items-center gap-2 pr-1.5 pl-3 md:h-auto md:flex-col md:gap-1 md:px-0 md:pt-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="max-md:order-last max-md:ml-auto"
              aria-label={`Show closed applications, ${total}`}
              aria-expanded={false}
              data-testid="tracker-closed"
              onClick={() => onOpen(firstClosedStage(counts))}
            >
              <ChevronsLeft strokeWidth={1.5} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Rejected and ghosted applications</TooltipContent>
        </Tooltip>
        <h2
          id={headingId}
          className="truncate text-label text-fg-secondary uppercase md:[writing-mode:vertical-rl] md:rotate-180"
        >
          Closed
        </h2>
        <span className="font-mono text-mono-sm text-fg-tertiary" aria-hidden="true">
          {total}
        </span>
      </header>
      <ul
        className="relative flex flex-col gap-2 px-2 pt-1 pb-2 md:items-center md:px-1.5"
        aria-label="Closed stages"
      >
        {CLOSED_STAGES.map((s) => (
          <ClosedTile
            key={s}
            stage={s}
            count={counts[s]}
            pointerDragging={pointerDragging}
            onOpen={onOpen}
          />
        ))}
      </ul>
      <p className="relative mt-auto px-3 pb-3 text-caption text-pretty text-fg-tertiary md:hidden">
        Rejected and ghosted applications rest here, out of your way.
      </p>
    </section>
  );
}

function ClosedTile({
  stage,
  count,
  pointerDragging,
  onOpen,
}: {
  stage: ClosedStage;
  count: number;
  pointerDragging: boolean;
  onOpen: (stage: ClosedStage) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: segmentDroppableId(stage), data: { stage } });
  const Icon = STAGE_ICONS[stage];
  return (
    <li ref={setNodeRef} className="w-full list-none">
      <m.button
        type="button"
        {...press.card}
        onClick={() => onOpen(stage)}
        title={STAGE_LABEL[stage]}
        aria-label={`${STAGE_LABEL[stage]}, ${count} ${count === 1 ? 'card' : 'cards'}`}
        className={cn(
          'e2 flex h-11 w-full items-center gap-2 rounded-md border px-3 text-small text-fg-secondary transition-colors duration-fast hover:border-border-strong hover:text-fg focus-visible:focus-ring md:h-14 md:flex-col md:justify-center md:gap-0.5 md:px-0',
          pointerDragging ? 'border-dashed border-border-strong' : 'border-border-subtle',
          pointerDragging && isOver && 'border-solid border-accent-strong text-fg',
        )}
      >
        <Icon className="size-4 shrink-0 text-fg-tertiary" strokeWidth={1.5} aria-hidden="true" />
        <span className="truncate md:sr-only">{STAGE_LABEL[stage]}</span>
        <span className="font-mono text-mono-sm text-fg-tertiary max-md:ml-auto">{count}</span>
      </m.button>
    </li>
  );
}
