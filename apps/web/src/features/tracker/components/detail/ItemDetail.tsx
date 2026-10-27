import { ArrowUpRight, MoreHorizontal, Radar, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import type { TrackerPatch } from '@/api/tracker';
import type { TrackerItemDTO } from '@/api/types';
import { DetailPageHeader } from '@/components/detail-page-header';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fromDateInputValue, toDateInputValue } from '@/features/sources/lib/format';
import { cn } from '@/lib/utils';
import { TRACKER_STAGES, type TrackerStage } from '@kestrel/shared';
import { CompanyLogo, TypeBadge, type PageHeaderPager } from '@kestrel/ui';

import { ContactsSection } from './ContactsSection';
import { DocumentsSection } from './DocumentsSection';
import { MoveOnSection } from './MoveOnSection';
import { NotesField } from './NotesField';
import { StageTimeline } from './StageTimeline';
import { nudgeCopy, type Nudge, type NudgeKind } from '../../lib/nudges';
import { isClosedStage, STAGE_ICONS, STAGE_LABEL } from '../../lib/stages';
import { NudgeActions, type NudgeAction } from '../NudgeList';

export interface ItemDetailProps {
  item: TrackerItemDTO;
  nudge: Nudge | null;
  sourceName: string | null;
  timeZone: string;
  onStage: (item: TrackerItemDTO, stage: TrackerStage) => void;
  onPatch: (item: TrackerItemDTO, patch: TrackerPatch) => Promise<unknown>;
  onRemove: (item: TrackerItemDTO) => void;
  onNudgeAction: (item: TrackerItemDTO, kind: NudgeKind, action: NudgeAction) => void;
  onTrackSimilar: (listingId: string, title: string) => void;
  /** Previous / next application in board order (`k` / `j`). */
  pager?: PageHeaderPager;
}

/**
 * One application as a full page (owner requirement: detail views are pages, not sheets):
 * status, applied date, deadline, notes (autosave), contacts, documents, the nudge, the move-on
 * list and the stage timeline, with a link to the listing page. Main column + a quiet side column
 * at lg; one column on phones.
 */
export function ItemDetail({
  item,
  nudge,
  sourceName,
  timeZone,
  onStage,
  onPatch,
  onRemove,
  onNudgeAction,
  onTrackSimilar,
  pager,
}: ItemDetailProps) {
  const copy = nudge ? nudgeCopy(nudge, item.company) : null;
  return (
    <article
      aria-labelledby="tracker-item-title"
      className="mx-auto flex w-full max-w-5xl flex-col pb-12"
    >
      <DetailPageHeader
        parent={{ label: 'Tracker', to: '/tracker' }}
        trail={[item.title]}
        titleId="tracker-item-title"
        title={item.title}
        pager={pager}
      />

      <div className="flex flex-col gap-6 px-gutter">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <CompanyLogo name={item.company} size={40} />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-body-lg text-fg">
              <span className="truncate font-medium" title={item.company}>
                {item.company}
              </span>
              {item.type ? <TypeBadge type={item.type} /> : null}
            </p>
            {item.listingId ? (
              <Link
                to={`/radar/${encodeURIComponent(item.listingId)}`}
                data-testid="tracker-item-listing"
                className="inline-flex items-center gap-1 rounded-xs text-small text-accent-strong underline-offset-3 hover:underline focus-visible:focus-ring"
              >
                <Radar className="size-3.5" strokeWidth={1.5} aria-hidden="true" /> See the listing
                and its fit
              </Link>
            ) : (
              <p className="text-small text-fg-tertiary">Added by hand</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={item.stage} onValueChange={(v) => onStage(item, v as TrackerStage)}>
              <SelectTrigger className="w-44" aria-label="Stage" data-testid="tracker-item-stage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRACKER_STAGES.map((s) => {
                  const Icon = STAGE_ICONS[s];
                  return (
                    <SelectItem key={s} value={s}>
                      <Icon strokeWidth={1.5} /> {STAGE_LABEL[s]}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {item.applyUrl ? (
              <Button asChild variant={item.stage === 'saved' ? 'primary' : 'secondary'}>
                <a href={item.applyUrl} target="_blank" rel="noreferrer noopener">
                  {item.stage === 'saved' ? 'Apply' : 'Apply page'}{' '}
                  <ArrowUpRight strokeWidth={1.5} />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="More actions">
                  <MoreHorizontal strokeWidth={1.5} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {item.listingId ? (
                  <DropdownMenuItem asChild>
                    <Link to={`/radar/${encodeURIComponent(item.listingId)}`}>
                      <Radar strokeWidth={1.5} /> Open the listing
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem variant="danger" onSelect={() => onRemove(item)}>
                  <Trash2 strokeWidth={1.5} /> Remove from tracker
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {nudge && copy ? (
          <div
            role="status"
            data-testid="tracker-item-nudge"
            className={cn(
              'flex flex-col gap-2 rounded-md border px-4 py-3 sm:flex-row sm:items-center',
              nudge.tone === 'danger'
                ? 'border-danger/30 bg-danger-subtle'
                : 'border-warning/30 bg-warning-subtle',
            )}
          >
            <p className="flex-1 text-small text-fg">
              <span className="font-medium">{copy.title}</span> {copy.body}
            </p>
            <div className="flex flex-wrap gap-1">
              <NudgeActions item={item} kind={nudge.kind} onAction={onNudgeAction} />
            </div>
          </div>
        ) : null}

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="flex min-w-0 flex-col gap-8">
            <NotesField notes={item.notes} onSave={(notes) => onPatch(item, { notes })} />
            <ContactsSection
              contacts={item.contacts}
              onChange={(contacts) => void onPatch(item, { contacts })}
            />
            <DocumentsSection
              documents={item.documents}
              onChange={(documents) => void onPatch(item, { documents })}
            />
            {isClosedStage(item.stage) ? (
              <MoveOnSection listingId={item.listingId} onTrack={onTrackSimilar} />
            ) : null}
          </div>
          <aside
            className="flex flex-col gap-6 lg:border-l lg:border-border-subtle lg:pl-6"
            aria-label="Details"
          >
            <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5">
              <Row label="Applied on" htmlFor={`applied-${item.id}`}>
                <Input
                  id={`applied-${item.id}`}
                  type="date"
                  value={toDateInputValue(item.appliedAt, timeZone)}
                  onChange={(e) =>
                    void onPatch(item, { appliedAt: fromDateInputValue(e.target.value) })
                  }
                  className="h-control-sm font-mono text-mono-sm"
                />
              </Row>
              <Row
                label={
                  item.stage === 'oa'
                    ? 'Test due'
                    : item.stage === 'offer'
                      ? 'Decide by'
                      : 'Deadline'
                }
                htmlFor={`deadline-${item.id}`}
              >
                <Input
                  id={`deadline-${item.id}`}
                  type="date"
                  value={toDateInputValue(item.deadlineAt, timeZone)}
                  onChange={(e) =>
                    void onPatch(item, { deadlineAt: fromDateInputValue(e.target.value) })
                  }
                  className="h-control-sm font-mono text-mono-sm"
                />
              </Row>
              <Row label="Source">
                <span className="truncate text-small text-fg-secondary">
                  {sourceName ?? (item.listingId ? 'From your radar' : 'Added by hand')}
                </span>
              </Row>
              {item.listingId ? (
                <Row label="Listing">
                  <Link
                    to={`/radar/${encodeURIComponent(item.listingId)}`}
                    className="inline-flex items-center gap-1 text-small text-accent-strong underline-offset-3 hover:underline focus-visible:focus-ring"
                  >
                    Open in Radar{' '}
                    <ArrowUpRight className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                  </Link>
                </Row>
              ) : null}
            </dl>
            <StageTimeline item={item} timeZone={timeZone} />
          </aside>
        </div>
      </div>
    </article>
  );
}

function Row({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <>
      <dt className="text-small text-fg-secondary">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}
      </dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}
