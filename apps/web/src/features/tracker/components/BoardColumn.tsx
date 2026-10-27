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

import { OUTCOME_STAGES, STAGE_ICONS, STAGE_LABEL, type ColumnDef, type OutcomeStage } from '../lib/stages';

const columnDroppableId = (stage: TrackerStage) => `col:${stage}`;
const segmentDroppableId = (stage: OutcomeStage) => `seg:${stage}`;

const COLUMN_SHELL = cn(
  'relative flex h-full shrink-0 snap-start flex-col rounded-lg bg-surface-sunken',
  'before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-accent-subtle before:opacity-0 before:transition-opacity before:duration-fade',
  'data-[over]:before:opacity-40',
);

/**
 * One Kanban column (DESIGN §10.4): `surface-sunken`, `rounded-lg`, min 272 px; header with the
 * label and a rolling count. The Outcomes column ("More") holds Offer, Rejected and Ghosted behind a
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
  onOutcomeStageChange,
  onCollapse,
  children,
}: {
  column: ColumnDef;
  /** The stage this column shows now (Outcomes: the active segment). */
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
  onOutcomeStageChange: (stage: OutcomeStage) => void;
  /** Outcomes only: fold back into the narrow "More" column. */
  onCollapse?: () => void;
  children: ReactNode;
}) {
  const headingId = useId();
  const { setNodeRef } = useDroppable({ id: columnDroppableId(stage), data: { stage } });
  const outcomes = column.key === 'outcomes';
  const total = outcomes ? counts.offer + counts.rejected + counts.ghosted : counts[stage];
  const Icon = STAGE_ICONS[outcomes ? stage : column.stages[0]!];

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
        <Icon className="relative size-4 shrink-0 text-fg-tertiary" strokeWidth={1.5} aria-hidden="true" />
        <h2 id={headingId} className="relative truncate text-label text-fg-secondary uppercase">
          {outcomes ? <span className="sr-only">{`Outcomes, ${STAGE_LABEL[stage]}`}</span> : null}
          <span aria-hidden={outcomes || undefined}>{column.label}</span>
        </h2>
        <Ticker
          value={total}
          className="relative text-mono-sm text-fg-tertiary"
          label={`${total} ${total === 1 ? 'card' : 'cards'}`}
        />
        <div className="relative ml-auto flex items-center">
          <Button variant="ghost" size="icon-sm" aria-label={`Add to ${STAGE_LABEL[stage]}`} onClick={() => onAdd(stage)}>
            <Plus strokeWidth={1.5} />
          </Button>
          {outcomes && onCollapse ? (
            <Button variant="ghost" size="icon-sm" aria-label="Fold outcomes away" aria-expanded onClick={onCollapse}>
              <ChevronsRight strokeWidth={1.5} />
            </Button>
          ) : null}
        </div>
      </header>
      {outcomes ? (
        <div className="relative px-2 pb-2">
          <ToggleGroup
            type="single"
            segmented
            value={stage}
            onValueChange={(v) => v && onOutcomeStageChange(v as OutcomeStage)}
            aria-label="Outcome"
            className="w-full"
          >
            {OUTCOME_STAGES.map((s) => (
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
  stage: OutcomeStage;
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
 * "More": the folded Outcomes column. Each outcome is a tile with its count; click to unfold on it,
 * or drag a card onto it (the column unfolds under the pointer, like a spring-loaded folder).
 */
export function OutcomesRail({
  counts,
  isOver,
  pointerDragging,
  onOpen,
}: {
  counts: Record<TrackerStage, number>;
  isOver: boolean;
  pointerDragging: boolean;
  onOpen: (stage: OutcomeStage) => void;
}) {
  const headingId = useId();
  const total = counts.offer + counts.rejected + counts.ghosted;
  return (
    <section
      data-testid="tracker-column"
      data-column="outcomes"
      data-collapsed="true"
      data-over={isOver || undefined}
      aria-labelledby={headingId}
      className={cn(COLUMN_SHELL, 'w-[min(85vw,20rem)] md:w-44')}
    >
      <header className="relative flex h-11 shrink-0 items-center gap-2 pr-1.5 pl-3">
        <h2 id={headingId} className="truncate text-label text-fg-secondary uppercase">
          More
        </h2>
        <span className="font-mono text-mono-sm text-fg-tertiary">{total}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto"
              aria-label="Show outcomes"
              aria-expanded={false}
              data-testid="tracker-more"
              onClick={() => onOpen(counts.offer > 0 || total === 0 ? 'offer' : counts.rejected > 0 ? 'rejected' : 'ghosted')}
            >
              <ChevronsLeft strokeWidth={1.5} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Offers and closed applications</TooltipContent>
        </Tooltip>
      </header>
      <ul className="relative flex flex-col gap-2 px-2 pb-2" aria-label="Outcomes">
        {OUTCOME_STAGES.map((s) => (
          <OutcomeTile key={s} stage={s} count={counts[s]} pointerDragging={pointerDragging} onOpen={onOpen} />
        ))}
      </ul>
      <p className="relative mt-auto px-3 pb-3 text-caption text-pretty text-fg-tertiary">
        Offers and closed applications live here, out of your way.
      </p>
    </section>
  );
}

function OutcomeTile({
  stage,
  count,
  pointerDragging,
  onOpen,
}: {
  stage: OutcomeStage;
  count: number;
  pointerDragging: boolean;
  onOpen: (stage: OutcomeStage) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: segmentDroppableId(stage), data: { stage } });
  const Icon = STAGE_ICONS[stage];
  return (
    <li ref={setNodeRef} className="list-none">
      <m.button
        type="button"
        {...press.card}
        onClick={() => onOpen(stage)}
        aria-label={`${STAGE_LABEL[stage]}, ${count} ${count === 1 ? 'card' : 'cards'}`}
        className={cn(
          'flex h-11 w-full items-center gap-2 rounded-md border bg-surface-raised px-3 text-small text-fg-secondary transition-colors duration-fast hover:border-border-strong hover:text-fg focus-visible:focus-ring',
          pointerDragging ? 'border-dashed border-border-strong' : 'border-border',
          pointerDragging && isOver && 'border-solid border-accent-strong text-fg',
        )}
      >
        <Icon className="size-4 shrink-0 text-fg-tertiary" strokeWidth={1.5} aria-hidden="true" />
        <span className="truncate">{STAGE_LABEL[stage]}</span>
        <span className="ml-auto font-mono text-mono-sm text-fg-tertiary">{count}</span>
      </m.button>
    </li>
  );
}
