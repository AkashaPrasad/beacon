import { StickyNote } from 'lucide-react';

import type { TrackerItemDTO } from '@/api/types';
import { cn } from '@/lib/utils';
import { CompanyLogo, DeadlineCountdown } from '@kestrel/ui';

import { ageLabel, notesCount, showsDeadline } from '../lib/card';
import { nudgeLabel, type Nudge } from '../lib/nudges';

/**
 * Kanban card content (DESIGN §6.2 KanbanCard): logo 20 + title (2 lines) + company, and a footer
 * with the age in mono, deadline where it still matters, the nudge indicator and a notes count.
 * Presentational only: the sortable card and the drag overlay both render it.
 */
export function CardFace({
  item,
  nudge,
  now,
  titleId,
  metaId,
}: {
  item: TrackerItemDTO;
  nudge: Nudge | null;
  now: Date;
  titleId?: string;
  metaId?: string;
}) {
  const notes = notesCount(item.notes);
  const deadline = showsDeadline(item.stage) && item.deadlineAt ? new Date(item.deadlineAt) : null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2 pr-6">
        <CompanyLogo name={item.company} size={20} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <p id={titleId} className="line-clamp-2 text-body font-medium text-pretty text-fg" title={item.title}>
            {item.title}
          </p>
          <p className="truncate text-small text-fg-secondary" title={item.company}>
            {item.company}
          </p>
        </div>
      </div>
      <div id={metaId} className="flex min-h-5 items-center gap-2 text-caption text-fg-tertiary">
        <span className="font-mono text-mono-sm whitespace-nowrap tabular-nums">{ageLabel(item, now)}</span>
        {deadline ? <DeadlineCountdown deadlineAt={deadline} now={now} /> : null}
        <span className="ml-auto flex items-center gap-2">
          {nudge ? (
            // A quiet dot, not a label: the banner above the board carries the words (UX restructure).
            <span
              title={nudgeLabel(nudge)}
              aria-hidden="true"
              className={cn('size-1.5 rounded-full', nudge.tone === 'danger' ? 'bg-danger' : 'bg-warning')}
            />
          ) : null}
          {notes > 0 ? (
            <span className="inline-flex items-center gap-0.5" title={`${notes} ${notes === 1 ? 'note' : 'notes'}`}>
              <StickyNote className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
              <span className="font-mono text-mono-sm">{notes}</span>
              <span className="sr-only">{notes === 1 ? 'note' : 'notes'}</span>
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}
