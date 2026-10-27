import { Check, ExternalLink, MoreHorizontal, PanelRightOpen, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

import type { TrackerItemDTO } from '@/api/types';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TRACKER_STAGES, type TrackerStage } from '@kestrel/shared';

import { STAGE_ICONS, STAGE_LABEL } from '../lib/stages';

/**
 * "Move to…" (DESIGN §9: the single-pointer alternative to dragging, key `m`). Opens from the card's
 * ⋯ button or with `m` on a focused card; type a stage name to jump to it (menu typeahead).
 */
export function MoveToMenu({
  item,
  open,
  onOpenChange,
  onMove,
  onOpenDetails,
  onRemove,
  onRestoreFocus,
  trigger,
}: {
  item: Pick<TrackerItemDTO, 'id' | 'title' | 'stage' | 'applyUrl'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMove: (stage: TrackerStage) => void;
  onOpenDetails: () => void;
  onRemove: () => void;
  /** Where focus goes when the menu closes (the card, not the hidden trigger). */
  onRestoreFocus: () => void;
  trigger?: ReactNode;
}) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <Button
            variant="ghost"
            size="icon-sm"
            tabIndex={-1}
            aria-label={`Move ${item.title}`}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal strokeWidth={1.5} />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onRestoreFocus();
        }}
        // Letters are menu typeahead here, never app shortcuts (`n`, `g t`…).
        onKeyDown={(e) => {
          if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) e.stopPropagation();
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuLabel>Move to…</DropdownMenuLabel>
        {TRACKER_STAGES.map((stage) => {
          const Icon = STAGE_ICONS[stage];
          const current = stage === item.stage;
          return (
            <DropdownMenuItem
              key={stage}
              disabled={current}
              textValue={STAGE_LABEL[stage]}
              onSelect={() => onMove(stage)}
            >
              <Icon strokeWidth={1.5} />
              <span>{STAGE_LABEL[stage]}</span>
              {current ? (
                <DropdownMenuShortcut>
                  <Check className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                  <span className="sr-only">Current stage</span>
                </DropdownMenuShortcut>
              ) : null}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onOpenDetails}>
          <PanelRightOpen strokeWidth={1.5} /> Open details
        </DropdownMenuItem>
        {item.applyUrl ? (
          <DropdownMenuItem asChild>
            <a href={item.applyUrl} target="_blank" rel="noreferrer noopener">
              <ExternalLink strokeWidth={1.5} /> Open apply link
            </a>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="danger" onSelect={onRemove}>
          <Trash2 strokeWidth={1.5} /> Remove from tracker
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
