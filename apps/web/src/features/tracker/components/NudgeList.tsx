import { BellDot, ChevronDown, Clock, Ghost } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useId, useState } from 'react';

import type { TrackerItemDTO } from '@/api/types';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { TrackerStage } from '@kestrel/shared';
import { springs, variants } from '@kestrel/ui';

import type { AttentionItem } from '../lib/attention';
import { nudgeSummary } from '../lib/nudge-summary';
import { nudgeCopy, type NudgeKind } from '../lib/nudges';
import { REPLY_STAGES, STAGE_ICONS, STAGE_LABEL } from '../lib/stages';

export type NudgeAction =
  | { type: 'template' }
  | { type: 'followed_up' }
  | { type: 'snooze' }
  | { type: 'keep_waiting' }
  | { type: 'ghost' }
  | { type: 'reply'; stage: TrackerStage }
  | { type: 'open' };

/**
 * Nudges as one gentle banner (UX restructure; USERFLOW §4): one sentence ("2 applications could
 * use a follow-up and 1 has gone quiet for a month.") with [Review]; the list with every action
 * (follow-up template, I followed up, snooze, got a reply, move to Ghosted, keep waiting) unfolds
 * inside it. Cards carry only a quiet dot.
 */
export function NudgeList({
  entries,
  onAction,
}: {
  entries: readonly AttentionItem[];
  onAction: (item: TrackerItemDTO, kind: NudgeKind, action: NudgeAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (entries.length === 0) return null;
  return (
    <section
      data-testid="tracker-nudges"
      aria-label="Nudges"
      className="mx-gutter mb-3 overflow-hidden rounded-md border border-border bg-surface-raised"
    >
      <div className="flex items-center gap-3 py-1.5 pr-1.5 pl-3">
        <BellDot className="size-4 shrink-0 text-warning" strokeWidth={1.5} aria-hidden="true" />
        <p className="min-w-0 flex-1 text-small text-fg">{nudgeSummary(entries)}</p>
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={open}
          aria-controls={listId}
          data-testid="tracker-nudges-toggle"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Hide' : 'Review'}
          <m.span animate={{ rotate: open ? 180 : 0 }} transition={springs.snappy} className="inline-flex">
            <ChevronDown strokeWidth={1.5} />
          </m.span>
        </Button>
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <m.ul
            id={listId}
            key="list"
            variants={variants.fade}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex flex-col divide-y divide-border-subtle border-t border-border-subtle"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {entries.map(({ item, nudge }) => {
                const copy = nudgeCopy(nudge, item.company);
                const Icon = nudge.kind === 'move_to_ghosted' ? Ghost : nudge.kind.endsWith('_due') ? Clock : BellDot;
                return (
                  <m.li
                    key={`${item.id}:${nudge.kind}`}
                    layout
                    variants={variants.row}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    transition={{ layout: springs.gentle }}
                    data-testid="tracker-nudge"
                    data-kind={nudge.kind}
                    data-item-id={item.id}
                    className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      <Icon
                        className={cn('mt-0.5 size-4 shrink-0', nudge.tone === 'danger' ? 'text-danger' : 'text-fg-tertiary')}
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <p className="text-small text-fg">
                          <span className="font-medium">{copy.title}</span> {copy.body}
                        </p>
                        <button
                          type="button"
                          onClick={() => onAction(item, nudge.kind, { type: 'open' })}
                          className="max-w-full truncate rounded-xs text-left text-caption text-fg-tertiary hover:text-fg focus-visible:focus-ring"
                        >
                          {item.title} · {item.company}
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 pl-6 sm:pl-0">
                      <NudgeActions item={item} kind={nudge.kind} onAction={onAction} />
                    </div>
                  </m.li>
                );
              })}
            </AnimatePresence>
          </m.ul>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

export function NudgeActions({
  item,
  kind,
  onAction,
}: {
  item: TrackerItemDTO;
  kind: NudgeKind;
  onAction: (item: TrackerItemDTO, kind: NudgeKind, action: NudgeAction) => void;
}) {
  const act = (action: NudgeAction) => onAction(item, kind, action);
  switch (kind) {
    case 'follow_up':
      return (
        <>
          <Button size="sm" variant="secondary" onClick={() => act({ type: 'template' })}>
            Copy template
          </Button>
          <Button size="sm" variant="ghost" onClick={() => act({ type: 'followed_up' })}>
            I followed up
          </Button>
          <Button size="sm" variant="ghost" onClick={() => act({ type: 'snooze' })}>
            Snooze 3 days
          </Button>
          <ReplyMenu onPick={(stage) => act({ type: 'reply', stage })} />
        </>
      );
    case 'move_to_ghosted':
      return (
        <>
          <Button size="sm" variant="secondary" onClick={() => act({ type: 'ghost' })}>
            Move to Ghosted
          </Button>
          <Button size="sm" variant="ghost" onClick={() => act({ type: 'keep_waiting' })}>
            Keep waiting
          </Button>
        </>
      );
    case 'interview_check':
      return (
        <>
          <ReplyMenu onPick={(stage) => act({ type: 'reply', stage })} />
          <Button size="sm" variant="ghost" onClick={() => act({ type: 'snooze' })}>
            Snooze 3 days
          </Button>
        </>
      );
    case 'oa_due':
    case 'offer_due':
      return (
        <Button size="sm" variant="ghost" onClick={() => act({ type: 'open' })}>
          Open
        </Button>
      );
  }
}

function ReplyMenu({ onPick }: { onPick: (stage: TrackerStage) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost">
          Got a reply <ChevronDown strokeWidth={1.5} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Move to…</DropdownMenuLabel>
        {REPLY_STAGES.map((stage) => {
          const Icon = STAGE_ICONS[stage];
          return (
            <DropdownMenuItem key={stage} onSelect={() => onPick(stage)}>
              <Icon strokeWidth={1.5} /> {STAGE_LABEL[stage]}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

