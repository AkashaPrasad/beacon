import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnOrderState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Columns3,
  MoreHorizontal,
  PanelRightOpen,
  Pencil,
  RefreshCw,
  SquareArrowOutUpRight,
  Trash2,
} from 'lucide-react';
import { m } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useBreakpoint } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';
import type { RefreshInterval } from '@kestrel/shared';
import { CompanyLogo, TypeBadge, useNow, variants } from '@kestrel/ui';

import { CountUp } from './common/CountUp';
import { HealthBadge } from './HealthBadge';
import { KindBadge } from './KindBadge';
import { formatAbsolute, formatRelative } from '../lib/format';
import { HEALTH_ORDER } from '../lib/health';
import {
  barOpacity,
  justAddedAge,
  LIVE_INSERT_BAR_MS,
  normaliseUrlKey,
  shouldPlayEnter,
} from '../lib/just-added';
import { packPath, sourcePath } from '../lib/paths';
import {
  displayUrl,
  INTERVAL_LABELS,
  INTERVAL_OPTIONS,
  KIND_LABELS,
  shortPackName,
  type SourceTableRow,
} from '../lib/rows';

export interface SourcesTableActions {
  onToggle: (row: SourceTableRow, enabled: boolean) => void;
  onInterval: (row: SourceTableRow, interval: RefreshInterval) => void;
  onRefresh: (row: SourceTableRow) => void;
  /** Quick edit (name, type, interval) in a small dialog; the source page has everything. */
  onEdit: (row: SourceTableRow) => void;
  onDelete: (row: SourceTableRow) => void;
  /** Hover / focus on a row's link: warm the source page. */
  onPrefetch?: (row: SourceTableRow) => void;
}

type ColumnId =
  | 'health'
  | 'name'
  | 'kind'
  | 'scope'
  | 'types'
  | 'interval'
  | 'lastChecked'
  | 'listings'
  | 'enabled'
  | 'menu';

interface ColumnMeta {
  width: string;
  /** Width in the simple list, when it differs. */
  simpleWidth?: string;
  align?: 'right' | 'center';
  label: string;
}

export const SOURCES_COLUMNS_KEY = 'beacon:sources:columns';

/** The simple list (default): what most people need to scan. */
const SIMPLE_ORDER: ColumnOrderState = ['name', 'kind', 'health', 'listings', 'enabled', 'menu'];
const SIMPLE_HIDDEN: VisibilityState = { scope: false, types: false, interval: false, lastChecked: false };
/** "Details": every column, health first (DESIGN §10.5). */
const DETAILS_ORDER: ColumnOrderState = [
  'health',
  'name',
  'kind',
  'scope',
  'types',
  'interval',
  'lastChecked',
  'listings',
  'enabled',
  'menu',
];

const helper = createColumnHelper<SourceTableRow>();

function SortIcon({ dir }: { dir: false | 'asc' | 'desc' }) {
  const Icon = dir === 'asc' ? ArrowUp : dir === 'desc' ? ArrowDown : ArrowUpDown;
  return (
    <Icon
      className={cn('size-3.5', !dir && 'opacity-0 group-hover/sort:opacity-100')}
      strokeWidth={1.5}
      aria-hidden="true"
    />
  );
}

/**
 * Sources table (DESIGN §10.5). By default a calm list: name, how it's read, a health mark, listings
 * and the switch. `details` adds health words, scope, types, interval and last check, plus sorting
 * and the column menu. TanStack Table for sorting/visibility, TanStack Virtual for 300+ rows; ARIA
 * table semantics on divs so each virtual row can carry a positioning wrapper.
 */
export function SourcesTable({
  rows,
  actions,
  details,
  visibility,
  emptyFilter,
}: {
  rows: SourceTableRow[];
  actions: SourcesTableActions;
  details: boolean;
  /** Column visibility from the Columns menu (details view only). */
  visibility: VisibilityState;
  emptyFilter?: ReactNode;
}) {
  const now = useNow(30_000);
  const bp = useBreakpoint();
  const phone = bp === 'base' || bp === 'sm';
  const [sorting, setSorting] = useState<SortingState>([]);
  const showDetails = details && !phone;

  const columns = useMemo(
    () => [
      helper.accessor((r) => HEALTH_ORDER[r.status], {
        id: 'health',
        header: 'Health',
        meta: { width: '112px', simpleWidth: '48px', align: undefined, label: 'Health' } satisfies ColumnMeta,
        cell: ({ row }) => (
          <HealthBadge
            status={row.original.status}
            reason={row.original.reason}
            variant={showDetails ? 'word' : 'icon'}
          />
        ),
      }),
      helper.accessor('name', {
        id: 'name',
        header: 'Source',
        sortingFn: (a, b) => a.original.name.localeCompare(b.original.name),
        meta: { width: 'minmax(200px, 1fr)', label: 'Source' } satisfies ColumnMeta,
        cell: ({ row }) => (
          <Link
            to={sourcePath(row.original.id)}
            onMouseEnter={() => actions.onPrefetch?.(row.original)}
            onFocus={() => actions.onPrefetch?.(row.original)}
            aria-disabled={row.original.optimistic || undefined}
            onClick={(e) => row.original.optimistic && e.preventDefault()}
            className="group/name -mx-1 flex min-w-0 items-center gap-2.5 rounded-sm px-1 py-1 focus-visible:focus-ring-inset"
          >
            <CompanyLogo name={row.original.name} domain={row.original.domain} size={20} />
            <span className="min-w-0">
              <span
                className="block truncate text-body font-medium text-fg group-hover/name:underline group-hover/name:underline-offset-3"
                title={row.original.url}
              >
                {row.original.name}
              </span>
              {showDetails ? (
                <span className="block truncate text-caption text-fg-tertiary">
                  {displayUrl(row.original.url)}
                </span>
              ) : null}
            </span>
          </Link>
        ),
      }),
      helper.accessor((r) => KIND_LABELS[r.kind], {
        id: 'kind',
        header: 'Read as',
        meta: { width: '136px', label: 'Read as' } satisfies ColumnMeta,
        cell: ({ row }) => <KindBadge kind={row.original.kind} />,
      }),
      helper.accessor((r) => (r.scope === 'personal' ? '0' : `1${r.packName ?? ''}`), {
        id: 'scope',
        header: 'Scope',
        meta: { width: '148px', label: 'Scope' } satisfies ColumnMeta,
        cell: ({ row }) =>
          row.original.scope === 'personal' || !row.original.packId ? (
            <span className="text-small text-fg-secondary">Yours</span>
          ) : (
            <Link
              to={packPath(row.original.packId)}
              className="max-w-full truncate rounded-xs text-small text-fg-secondary hover:text-fg hover:underline focus-visible:focus-ring"
              title={row.original.packName ?? undefined}
            >
              {shortPackName(row.original.packName ?? 'Pack')}
            </Link>
          ),
      }),
      helper.accessor((r) => r.typeTag ?? '', {
        id: 'types',
        header: 'Types',
        meta: { width: '120px', label: 'Types' } satisfies ColumnMeta,
        cell: ({ row }) =>
          row.original.typeTag ? (
            <TypeBadge type={row.original.typeTag} />
          ) : (
            <span className="text-small text-fg-tertiary">Any</span>
          ),
      }),
      helper.accessor('refreshInterval', {
        id: 'interval',
        header: 'Every',
        enableSorting: false,
        meta: { width: '112px', label: 'Refresh interval' } satisfies ColumnMeta,
        cell: ({ row }) =>
          row.original.editable ? (
            <Select
              value={row.original.refreshInterval}
              onValueChange={(v) => actions.onInterval(row.original, v as RefreshInterval)}
              disabled={row.original.optimistic}
            >
              <SelectTrigger
                size="sm"
                aria-label={`Refresh interval for ${row.original.name}`}
                className="h-7 w-24 px-2"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTERVAL_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span
              className="pl-2 font-mono text-mono-sm text-fg-secondary"
              title="Shared sources refresh on the pack schedule"
            >
              {INTERVAL_LABELS[row.original.refreshInterval]}
            </span>
          ),
      }),
      helper.accessor((r) => (r.lastCheckedAt ? new Date(r.lastCheckedAt).getTime() : 0), {
        id: 'lastChecked',
        header: 'Last check',
        meta: { width: '112px', label: 'Last check' } satisfies ColumnMeta,
        cell: ({ row }) => (
          <span
            className="font-mono text-mono-sm whitespace-nowrap text-fg-secondary"
            title={
              row.original.lastCheckedAt ? formatAbsolute(row.original.lastCheckedAt) : undefined
            }
          >
            {row.original.lastCheckedAt
              ? formatRelative(row.original.lastCheckedAt, now)
              : row.original.status === 'pending'
                ? 'Checking…'
                : 'Never'}
          </span>
        ),
      }),
      helper.accessor('listingsFound', {
        id: 'listings',
        header: 'Listings',
        meta: { width: '88px', align: 'right', label: 'Listings' } satisfies ColumnMeta,
        cell: ({ row }) =>
          row.original.status === 'error' && row.original.listingsFound === 0 ? (
            <span className="font-mono text-mono text-fg-tertiary">—</span>
          ) : (
            <CountUp value={row.original.listingsFound} className="text-right text-mono text-fg" />
          ),
      }),
      helper.accessor('enabled', {
        id: 'enabled',
        header: 'On',
        enableSorting: false,
        meta: { width: '56px', align: 'center', label: 'On' } satisfies ColumnMeta,
        cell: ({ row }) =>
          row.original.editable ? (
            <Switch
              checked={row.original.enabled}
              disabled={row.original.optimistic}
              onCheckedChange={(v) => actions.onToggle(row.original, v)}
              aria-label={`${row.original.enabled ? 'Pause' : 'Resume'} ${row.original.name}`}
            />
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to={row.original.packId ? packPath(row.original.packId) : '/sources?tab=packs'}
                  className="inline-flex cursor-default rounded-full focus-visible:focus-ring"
                  aria-label={`${row.original.name} is on through ${row.original.packName ?? 'its pack'}. Manage the pack`}
                >
                  {/* Read-only switch visual: pack rows follow the pack's own switch. */}
                  <span
                    aria-hidden="true"
                    className="inline-flex h-5 w-9 items-center rounded-full bg-accent p-0.5 opacity-50"
                  >
                    <span className="block size-4 translate-x-4 rounded-full bg-surface-raised shadow-sm" />
                  </span>
                </Link>
              </TooltipTrigger>
              <TooltipContent>
                On through {row.original.packName ?? 'a pack'}. Manage it on the pack’s page.
              </TooltipContent>
            </Tooltip>
          ),
      }),
      helper.display({
        id: 'menu',
        header: () => <span className="sr-only">Actions</span>,
        meta: { width: '44px', align: 'center', label: 'Actions' } satisfies ColumnMeta,
        cell: ({ row }) => <RowMenu row={row.original} actions={actions} />,
      }),
    ],
    [actions, now, showDetails],
  );

  const effectiveVisibility = useMemo((): VisibilityState => {
    if (phone) {
      return { kind: false, scope: false, types: false, interval: false, lastChecked: false, health: false };
    }
    if (!showDetails) return SIMPLE_HIDDEN;
    const narrow: VisibilityState = bp === 'md' || bp === 'lg' ? { scope: false, types: false } : {};
    return { ...narrow, ...visibility };
  }, [phone, bp, visibility, showDetails]);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table returns unmemoisable functions; the compiler skips this component, which is intended.
  const table = useReactTable({
    data: rows,
    columns,
    state: {
      // Sorting belongs to the details view; the simple list keeps the natural order.
      sorting: showDetails ? sorting : [],
      columnVisibility: effectiveVisibility,
      columnOrder: showDetails ? DETAILS_ORDER : SIMPLE_ORDER,
    },
    enableSorting: showDetails,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (r) => r.id,
  });

  const visibleColumns = table.getVisibleLeafColumns();
  const template = visibleColumns
    .map((c) => {
      const meta = c.columnDef.meta as ColumnMeta;
      return showDetails ? meta.width : (meta.simpleWidth ?? meta.width);
    })
    .join(' ');
  const tableRows = table.getRowModel().rows;

  const scrollRef = useRef<HTMLDivElement>(null);
  useFillViewport(scrollRef);
  // TanStack Virtual returns fresh functions each render; the React Compiler skips this component.
  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => {
      const r = tableRows[i]?.original;
      const base = phone ? 64 : showDetails ? 44 : 56;
      return r && r.editable && (r.status === 'error' || r.status === 'paused') ? base + 32 : base;
    },
    // Personal rows are keyed by URL, not id: the optimistic row (temp id) and the saved row (server
    // id) stay one element, so the live insert never replays when the id swaps.
    getItemKey: (i) => {
      const r = tableRows[i]?.original;
      if (!r) return i;
      return r.editable ? `personal:${normaliseUrlKey(r.url)}` : `pack:${r.id}`;
    },
    overscan: 12,
  });

  return (
    <div className="flex min-h-0 flex-col">
      <div
        ref={scrollRef}
        role="table"
        aria-label="Sources"
        aria-rowcount={tableRows.length + 1}
        data-testid="sources-table"
        data-view={showDetails ? 'details' : 'simple'}
        className="relative min-h-60 overflow-auto overscroll-contain [scrollbar-width:thin]"
      >
        <div
          role="rowgroup"
          className={
            showDetails
              ? 'sticky top-0 z-sticky border-b border-border bg-surface'
              : // The simple list needs no visible header; screen readers still get one.
                'sr-only'
          }
        >
          <div
            role="row"
            aria-rowindex={1}
            className="grid items-center px-gutter"
            style={{ gridTemplateColumns: template }}
          >
            {table.getHeaderGroups()[0]?.headers.map((header) => {
              const meta = header.column.columnDef.meta as ColumnMeta;
              const sorted = header.column.getIsSorted();
              const canSort = header.column.getCanSort();
              return (
                <div
                  key={header.id}
                  role="columnheader"
                  aria-sort={
                    sorted === 'asc'
                      ? 'ascending'
                      : sorted === 'desc'
                        ? 'descending'
                        : canSort
                          ? 'none'
                          : undefined
                  }
                  className={cn(
                    'flex h-9 items-center px-cell text-label text-fg-tertiary uppercase',
                    meta.align === 'right' && 'justify-end',
                    meta.align === 'center' && 'justify-center',
                  )}
                >
                  {canSort ? (
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className={cn(
                        'group/sort -mx-1 inline-flex items-center gap-1 rounded-xs px-1 uppercase hover:text-fg focus-visible:focus-ring',
                        sorted && 'text-fg',
                      )}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <SortIcon dir={sorted} />
                    </button>
                  ) : (
                    flexRender(header.column.columnDef.header, header.getContext())
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {tableRows.length === 0 ? (
          <div role="rowgroup">
            <div role="row">
              <div role="cell" className="px-gutter py-10 text-center text-body text-fg-secondary">
                {emptyFilter ?? 'No sources yet.'}
              </div>
            </div>
          </div>
        ) : (
          <div role="rowgroup" className="relative" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((v) => {
              const row = tableRows[v.index];
              if (!row) return null;
              const r = row.original;
              const showReason = r.editable && (r.status === 'error' || r.status === 'paused');
              const age = r.editable ? justAddedAge(r.url) : null;
              const animateIn = shouldPlayEnter(age);
              return (
                <div
                  key={v.key}
                  ref={virtualizer.measureElement}
                  data-index={v.index}
                  data-testid="source-row"
                  data-source-id={r.id}
                  data-health={r.health}
                  data-health-code={r.healthCode}
                  data-scope={r.scope}
                  role="presentation"
                  className="absolute inset-x-0 top-0"
                  style={{ transform: `translateY(${v.start}px)` }}
                >
                  {age !== null ? <LiveInsertBar age={age} /> : null}
                  <m.div
                    role="row"
                    aria-rowindex={v.index + 2}
                    data-testid="sources-row"
                    data-pending={r.optimistic || undefined}
                    variants={variants.row}
                    initial={animateIn ? 'hidden' : false}
                    animate="visible"
                    className={cn(
                      'grid items-center border-b border-border-subtle px-gutter transition-colors duration-fast hover:bg-surface-hover hover:duration-0',
                      phone ? 'min-h-16 py-2' : showDetails ? 'min-h-row-table' : 'min-h-14',
                      !r.enabled && 'text-fg-tertiary [&_img]:opacity-60',
                    )}
                    style={{ gridTemplateColumns: template }}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta as ColumnMeta;
                      return (
                        <div
                          key={cell.id}
                          role="cell"
                          className={cn(
                            'flex min-w-0 items-center px-cell',
                            meta.align === 'right' && 'justify-end',
                            meta.align === 'center' && 'justify-center',
                          )}
                        >
                          {phone && cell.column.id === 'name' ? (
                            <PhoneNameCell
                              row={r}
                              now={now}
                              onPrefetch={() => actions.onPrefetch?.(r)}
                            />
                          ) : (
                            flexRender(cell.column.columnDef.cell, cell.getContext())
                          )}
                        </div>
                      );
                    })}
                    {showReason ? (
                      <div
                        role="cell"
                        className={cn(
                          'col-span-full -mt-1 mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 max-md:pl-cell',
                          showDetails ? 'pl-[124px]' : 'pl-[42px]',
                        )}
                      >
                        <span className="text-small text-fg-secondary">{r.reason}</span>
                        {r.status === 'error' ? (
                          <span className="flex gap-1">
                            <Button
                              size="xs"
                              variant="secondary"
                              onClick={() => actions.onRefresh(r)}
                            >
                              Try again
                            </Button>
                            <Button size="xs" variant="ghost" onClick={() => actions.onEdit(r)}>
                              Fix the link
                            </Button>
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </m.div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Phone layout: one link per card with health, last check and kind (DESIGN §10.5 mobile card list). */
function PhoneNameCell({
  row,
  now,
  onPrefetch,
}: {
  row: SourceTableRow;
  now: Date;
  onPrefetch: () => void;
}) {
  return (
    <Link
      to={sourcePath(row.id)}
      onFocus={onPrefetch}
      onTouchStart={onPrefetch}
      aria-disabled={row.optimistic || undefined}
      onClick={(e) => row.optimistic && e.preventDefault()}
      className="flex w-full min-w-0 items-start gap-2.5 rounded-sm text-left focus-visible:focus-ring-inset"
    >
      <CompanyLogo name={row.name} domain={row.domain} size={28} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-medium text-fg" title={row.name}>
          {row.name}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 text-caption text-fg-tertiary">
          <HealthBadge
            status={row.status}
            reason={row.reason}
            interactive={false}
            className="h-5 text-caption"
          />
          <span className="font-mono">
            {row.lastCheckedAt ? formatRelative(row.lastCheckedAt, now) : 'Never'}
          </span>
          <span>{KIND_LABELS[row.kind]}</span>
        </span>
      </span>
    </Link>
  );
}

/** MOTION §5.5 live insert: the 2 px accent-strong bar fades out over 4 s (opacity only). */
function LiveInsertBar({ age }: { age: number }) {
  const remaining = Math.max(0, LIVE_INSERT_BAR_MS - age) / 1000;
  return (
    <m.span
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 left-0 z-raised w-0.5 bg-accent-strong"
      initial={{ opacity: barOpacity(age) }}
      animate={{ opacity: 0 }}
      transition={{ type: 'tween', duration: remaining, ease: 'linear' }}
    />
  );
}

function RowMenu({ row, actions }: { row: SourceTableRow; actions: SourcesTableActions }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${row.name}`}
          disabled={row.optimistic}
        >
          <MoreHorizontal strokeWidth={1.5} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem asChild>
          <Link to={sourcePath(row.id)}>
            <PanelRightOpen strokeWidth={1.5} /> Open details
          </Link>
        </DropdownMenuItem>
        {row.editable ? (
          <>
            <DropdownMenuItem onSelect={() => actions.onRefresh(row)}>
              <RefreshCw strokeWidth={1.5} /> Check now
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => actions.onEdit(row)}>
              <Pencil strokeWidth={1.5} /> Quick edit…
            </DropdownMenuItem>
          </>
        ) : row.packId ? (
          <DropdownMenuItem asChild>
            <Link to={packPath(row.packId)}>
              <Columns3 strokeWidth={1.5} /> Show pack
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <a href={row.url} target="_blank" rel="noreferrer noopener">
            <SquareArrowOutUpRight strokeWidth={1.5} /> Open the page
          </a>
        </DropdownMenuItem>
        {row.editable ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="danger" onSelect={() => actions.onDelete(row)}>
              <Trash2 strokeWidth={1.5} /> Delete
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Columns menu (details view; column visibility, persisted per device). */
export function ColumnsMenu({
  value,
  onChange,
}: {
  value: VisibilityState;
  onChange: (v: VisibilityState) => void;
}) {
  const items: { id: ColumnId; label: string }[] = [
    { id: 'kind', label: 'Read as' },
    { id: 'scope', label: 'Scope' },
    { id: 'types', label: 'Types' },
    { id: 'interval', label: 'Refresh interval' },
    { id: 'lastChecked', label: 'Last check' },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          <Columns3 strokeWidth={1.5} /> Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Show columns</DropdownMenuLabel>
        {items.map((item) => (
          <DropdownMenuCheckboxItem
            key={item.id}
            checked={value[item.id] !== false}
            onCheckedChange={(checked) => onChange({ ...value, [item.id]: checked })}
            onSelect={(e) => e.preventDefault()}
          >
            {item.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Size a scroll container to the rest of the viewport (minus the phone tab bar), without re-rendering. */
function useFillViewport(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const apply = () => {
      const top = node.getBoundingClientRect().top + window.scrollY;
      const tabbar = window.matchMedia('(min-width: 768px)').matches ? 0 : 56;
      node.style.height = `max(15rem, calc(100dvh - ${Math.max(0, top)}px - ${tabbar}px - env(safe-area-inset-bottom, 0px)))`;
    };
    apply();
    window.addEventListener('resize', apply);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(apply) : null;
    if (node.parentElement) ro?.observe(node.parentElement);
    return () => {
      window.removeEventListener('resize', apply);
      ro?.disconnect();
    };
  }, [ref]);
}
