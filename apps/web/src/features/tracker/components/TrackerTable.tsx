import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, BellDot, Filter, Ghost, Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import type { TrackerItemDTO } from '@/api/types';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatAbsolute, formatRelative, formatShortDate } from '@/features/sources/lib/format';
import { cn } from '@/lib/utils';
import { TRACKER_STAGES, type TrackerStage } from '@kestrel/shared';
import { CompanyLogo, DeadlineCountdown } from '@kestrel/ui';

import { nudgeLabel, type Nudge } from '../lib/nudges';
import { STAGE_ICONS, STAGE_LABEL } from '../lib/stages';
import { useFillViewport } from '../lib/use-fill-viewport';

interface Row {
  item: TrackerItemDTO;
  nudge: Nudge | null;
  source: string | null;
}

const helper = createColumnHelper<Row>();
const stageOrder = (s: TrackerStage) => TRACKER_STAGES.indexOf(s);
const time = (v: Date | string | null | undefined) => (v ? new Date(v).getTime() : Number.NEGATIVE_INFINITY);

/**
 * Table view (DESIGN §6.1: TanStack Table, same fields as the cards, status as an inline Select,
 * sortable `label` headers). Search and a stage filter sit above; the header sticks while scrolling.
 * Lazy-loaded, so @tanstack/react-table only ships when the table is opened.
 */
export default function TrackerTable({
  items,
  nudges,
  sourceNames,
  now,
  timeZone,
  onOpen,
  onStage,
}: {
  items: TrackerItemDTO[];
  nudges: ReadonlyMap<string, Nudge>;
  sourceNames: ReadonlyMap<string, string>;
  now: Date;
  timeZone: string;
  onOpen: (id: string) => void;
  onStage: (item: TrackerItemDTO, stage: TrackerStage) => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'stage', desc: false }]);
  const [query, setQuery] = useState('');
  const [stages, setStages] = useState<ReadonlySet<TrackerStage>>(() => new Set(TRACKER_STAGES));
  const scrollRef = useRef<HTMLDivElement>(null);
  useFillViewport(scrollRef, 16);

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => stages.has(i.stage))
      .filter((i) => !q || `${i.title} ${i.company} ${i.notes}`.toLowerCase().includes(q))
      .map((item) => ({
        item,
        nudge: nudges.get(item.id) ?? null,
        source: item.sourceId ? (sourceNames.get(item.sourceId) ?? null) : null,
      }));
  }, [items, nudges, sourceNames, query, stages]);

  const columns = useMemo(
    () => [
      helper.accessor((r) => r.item.title.toLowerCase(), {
        id: 'role',
        header: 'Role',
        cell: ({ row }) => {
          const { item } = row.original;
          return (
            <button
              type="button"
              onClick={() => onOpen(item.id)}
              className="flex min-w-0 items-center gap-2 rounded-xs text-left focus-visible:focus-ring"
            >
              <CompanyLogo name={item.company} size={20} />
              <span className="min-w-0">
                <span className="block truncate text-body font-medium text-fg" title={item.title}>
                  {item.title}
                </span>
                <span className="block truncate text-caption text-fg-secondary" title={item.company}>
                  {item.company}
                </span>
              </span>
            </button>
          );
        },
      }),
      helper.accessor((r) => stageOrder(r.item.stage), {
        id: 'stage',
        header: 'Stage',
        cell: ({ row }) => {
          const { item } = row.original;
          return (
            <Select value={item.stage} onValueChange={(v) => onStage(item, v as TrackerStage)}>
              <SelectTrigger size="sm" className="h-7 w-36" aria-label={`Stage for ${item.title}`}>
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
          );
        },
      }),
      helper.accessor((r) => time(r.item.appliedAt), {
        id: 'applied',
        header: 'Applied',
        cell: ({ row }) => (
          <span className="font-mono text-mono-sm whitespace-nowrap text-fg-secondary" title={row.original.item.appliedAt ? formatAbsolute(row.original.item.appliedAt, timeZone) : undefined}>
            {row.original.item.appliedAt ? formatShortDate(row.original.item.appliedAt, timeZone) : '—'}
          </span>
        ),
      }),
      helper.accessor((r) => (r.item.deadlineAt ? time(r.item.deadlineAt) : Number.POSITIVE_INFINITY), {
        id: 'deadline',
        header: 'Deadline',
        cell: ({ row }) =>
          row.original.item.deadlineAt ? (
            <span title={formatAbsolute(row.original.item.deadlineAt, timeZone)}>
              <DeadlineCountdown deadlineAt={new Date(row.original.item.deadlineAt)} now={now} />
            </span>
          ) : (
            <span className="font-mono text-mono-sm text-fg-tertiary">—</span>
          ),
      }),
      helper.accessor((r) => r.source ?? '', {
        id: 'source',
        header: 'Source',
        cell: ({ row }) => (
          <span className="block max-w-40 truncate text-small text-fg-secondary">
            {row.original.source ?? (row.original.item.listingId ? 'Radar' : 'By hand')}
          </span>
        ),
      }),
      helper.accessor((r) => time(r.item.lastActivityAt), {
        id: 'activity',
        header: 'Last activity',
        cell: ({ row }) => (
          <span className="flex items-center gap-1.5 font-mono text-mono-sm whitespace-nowrap text-fg-secondary">
            {formatRelative(row.original.item.lastActivityAt, now)}
            {row.original.nudge ? (
              <span
                className={cn('inline-flex items-center gap-1 font-sans text-caption font-medium', row.original.nudge.tone === 'danger' ? 'text-danger' : 'text-warning')}
              >
                {row.original.nudge.kind === 'move_to_ghosted' ? (
                  <Ghost className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                ) : (
                  <BellDot className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                )}
                {nudgeLabel(row.original.nudge)}
              </span>
            ) : null}
          </span>
        ),
      }),
      helper.accessor((r) => r.item.notes, {
        id: 'notes',
        header: 'Notes',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="line-clamp-1 max-w-64 text-small text-fg-secondary" title={row.original.item.notes || undefined}>
            {row.original.item.notes || <span className="text-fg-tertiary">—</span>}
          </span>
        ),
      }),
    ],
    [now, onOpen, onStage, timeZone],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (r) => r.item.id,
  });

  const allStages = stages.size === TRACKER_STAGES.length;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 px-gutter pb-2">
        <div className="relative w-full max-w-72">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-tertiary"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by role, company or notes"
            aria-label="Filter applications"
            className="h-control-sm pl-8 text-small"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <Filter strokeWidth={1.5} />
              {allStages ? 'All stages' : `${stages.size} of ${TRACKER_STAGES.length} stages`}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel>Show stages</DropdownMenuLabel>
            {TRACKER_STAGES.map((s) => (
              <DropdownMenuCheckboxItem
                key={s}
                checked={stages.has(s)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(on) =>
                  setStages((prev) => {
                    const next = new Set(prev);
                    if (on) next.add(s);
                    else next.delete(s);
                    return next;
                  })
                }
              >
                {STAGE_LABEL[s]}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setStages(new Set(TRACKER_STAGES))}>Show all</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setStages(new Set(['applied', 'oa', 'interview', 'offer']))}>
              Active only
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="font-mono text-mono-sm text-fg-tertiary" aria-live="polite">
          {rows.length === items.length ? rows.length : `${rows.length} of ${items.length}`}
        </span>
      </div>
      <div ref={scrollRef} className="min-h-0 overflow-auto overscroll-contain [scrollbar-width:thin]">
        <table data-testid="tracker-table" className="w-full min-w-[56rem] border-collapse text-small">
          <thead className="sticky top-0 z-sticky bg-surface">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="border-b border-border">
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();
                  const SortIcon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown;
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : canSort ? 'none' : undefined}
                      className={cn('h-9 px-cell text-left text-label font-medium text-fg-tertiary uppercase first:pl-gutter last:pr-gutter')}
                    >
                      {canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn('group/sort -mx-1 inline-flex items-center gap-1 rounded-xs px-1 uppercase hover:text-fg focus-visible:focus-ring', sorted && 'text-fg')}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <SortIcon className={cn('size-3.5', !sorted && 'opacity-0 group-hover/sort:opacity-100')} strokeWidth={1.5} aria-hidden="true" />
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-gutter py-10 text-center text-body text-fg-secondary">
                  No applications match these filters.{' '}
                  <button
                    type="button"
                    className="text-accent-strong hover:underline focus-visible:focus-ring"
                    onClick={() => {
                      setQuery('');
                      setStages(new Set(TRACKER_STAGES));
                    }}
                  >
                    Clear filters
                  </button>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  data-testid="tracker-row"
                  data-item-id={row.original.item.id}
                  data-stage={row.original.item.stage}
                  className="h-row-table border-b border-border-subtle transition-colors duration-fast hover:bg-surface-hover hover:duration-0"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-cell py-1.5 align-middle first:pl-gutter last:pr-gutter">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
