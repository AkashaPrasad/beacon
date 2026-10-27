/**
 * Phone layout of the deadline timeline (DESIGN §10.3 "Mobile"): a vertical agenda instead of strips.
 * Sticky day headers read "Tue 28 Oct · Today"; each deadline is a full-width 56 px row that opens the
 * bottom-sheet drawer, with a 44 px Track button (the touch alternative to dragging to the dock).
 */
import { KanbanSquare, KanbanSquareDashed } from 'lucide-react';

import { RowDeadline } from '@/features/radar/components/RadarRow';
import { cn } from '@/lib/utils';
import { TYPE_META } from '@kestrel/ui';

import { MiniFitRing } from './TimelinePill';
import { typeColor, type TimelineItem, type TimelineModel } from '../lib/timeline';
import { diffDays, formatDayKey } from '../lib/weeks';

function AgendaRow({
  item,
  now,
  open,
  onOpen,
  onTrack,
}: {
  item: TimelineItem;
  now: Date;
  open: boolean;
  onOpen: (id: string) => void;
  onTrack: (item: TimelineItem) => void;
}) {
  const Icon = TYPE_META[item.type].icon;
  const closed = Boolean(item.deadlineAt && item.deadlineAt.getTime() < now.getTime());
  const tracked = Boolean(item.trackerItemId);
  return (
    <li
      className={cn(
        'flex items-center border-b border-border-subtle bg-transparent pointer-fine:hover:bg-surface-hover',
        closed && 'text-fg-secondary',
      )}
    >
      <button
        type="button"
        data-testid="deadlines-pill"
        data-listing-id={item.id}
        aria-current={open ? 'true' : undefined}
        onClick={() => onOpen(item.id)}
        className="relative flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 pr-2 pl-4 text-left active:bg-surface-active focus-visible:focus-ring-inset"
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-2 left-0 w-[3px] rounded-r-full"
          style={{ background: typeColor(item.type) }}
        />
        <Icon
          className="size-4 shrink-0"
          strokeWidth={1.5}
          aria-hidden="true"
          style={{ color: typeColor(item.type, 'var(--color-fg-secondary)') }}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-body font-medium text-fg" title={item.title}>
            {item.title}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-small text-fg-tertiary">
            <span className="truncate text-fg-secondary">{item.company}</span>
            <span aria-hidden="true">·</span>
            <RowDeadline deadlineAt={item.deadlineAt} deadlineKind={item.deadlineKind} now={now} />
          </span>
        </span>
        <MiniFitRing score={item.score} />
      </button>
      <button
        type="button"
        aria-label={tracked ? `${item.title} is in your tracker` : `Add ${item.title} to tracker`}
        disabled={tracked}
        onClick={() => onTrack(item)}
        className="mr-1 grid size-11 shrink-0 place-items-center rounded-sm text-fg-tertiary press-icon active:bg-surface-active disabled:text-accent-strong focus-visible:focus-ring"
      >
        {tracked ? (
          <KanbanSquare className="size-5" strokeWidth={1.5} aria-hidden="true" />
        ) : (
          <KanbanSquareDashed className="size-5" strokeWidth={1.5} aria-hidden="true" />
        )}
      </button>
    </li>
  );
}

export function AgendaList({
  model,
  now,
  openId,
  stickyTop,
  onOpen,
  onTrack,
}: {
  model: TimelineModel;
  now: Date;
  openId: string | null;
  /** px from the viewport top where day headers stick (top bar + any sticky toolbar). */
  stickyTop: number;
  onOpen: (id: string) => void;
  onTrack: (item: TimelineItem) => void;
}) {
  const days = model.weeks
    .flatMap((w) => w.days)
    .filter((d) => (model.byDay.get(d)?.length ?? 0) > 0);
  return (
    <div data-testid="deadlines-timeline" data-layout="agenda" className="flex flex-col">
      {days.map((day) => {
        const items = model.byDay.get(day) ?? [];
        const offset = diffDays(model.todayKey, day);
        const label =
          offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : offset === -1 ? 'Yesterday' : null;
        return (
          <section
            key={day}
            aria-label={`${formatDayKey(day)}${label ? `, ${label}` : ''}: ${items.length} deadlines`}
          >
            <h3
              className={cn(
                'sticky z-sticky flex h-9 items-center gap-2 border-b border-border-subtle bg-bg/95 px-4 font-mono text-mono-sm',
                offset < 0 ? 'text-fg-tertiary' : 'text-fg-secondary',
              )}
              style={{ top: stickyTop }}
            >
              <span className={cn(offset === 0 && 'text-accent-strong')}>{formatDayKey(day)}</span>
              {label && (
                <span className={cn(offset === 0 ? 'text-accent-strong' : 'text-fg-tertiary')}>
                  · {label}
                </span>
              )}
              <span className="ml-auto text-fg-tertiary">{items.length}</span>
            </h3>
            <ul>
              {items.map((item) => (
                <AgendaRow
                  key={item.id}
                  item={item}
                  now={now}
                  open={openId === item.id}
                  onOpen={onOpen}
                  onTrack={onTrack}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
