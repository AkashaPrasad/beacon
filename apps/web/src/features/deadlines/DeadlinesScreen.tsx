/**
 * Deadlines: `/deadlines` (DESIGN §10.3, USERFLOW §3.3). Week strips for the next 4 / 8 / 12 weeks
 * (one past week for context), filters in the URL (`types`, `minFit`, `weeks`, `saved`), and the
 * listing drawer on `?open=<id>` so Back closes it. Pills drag to the tracker dock; `a` tracks the
 * focused pill; `t` jumps to today; `[` / `]` page weeks. Phones get the vertical agenda.
 */
import { CalendarDays, ChevronDown, Filter } from 'lucide-react';
import { useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { useMe } from '@/api/me';
import { useCommandItems } from '@/components/command-palette/registry';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { ListingDrawer } from '@/features/radar/components/drawer/ListingDrawer';
import { FitThreshold, ViewSwitch } from '@/features/radar/components/RadarToolbar';
import { useListingActions } from '@/features/radar/hooks/useListingActions';
import { useMediaQuery } from '@/lib/use-media-query';
import { OPPORTUNITY_TYPES } from '@kestrel/shared';
import { TYPE_META, useNow } from '@kestrel/ui';

import { DeadlineTimeline } from './components/DeadlineTimeline';
import { useDeadlineFeed } from './hooks/useDeadlineFeed';
import {
  deadlineFeedQuery,
  deadlineParamsFrom,
  deadlineParamsTo,
  timelineOrder,
  WEEK_OPTIONS,
  type DeadlineParams,
  type TimelineItem,
  type WeeksOption,
} from './lib/timeline';

export function Component() {
  return <DeadlinesScreen />;
}

function DeadlinesScreen() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const me = useMe();
  const now = useNow(60_000);
  const nowMs = Math.floor(now.getTime() / 60_000) * 60_000;
  const timeZone = me.data?.settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  const aiEnabled = me.data?.settings.aiEnabled ?? true;
  const phone = !useMediaQuery('(min-width: 768px)');
  const actions = useListingActions();
  const headerRef = useRef<HTMLDivElement>(null);

  const value = useMemo(() => deadlineParamsFrom(params), [params]);
  const key = deadlineParamsTo(value).toString();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const query = useMemo(() => deadlineFeedQuery(value), [key]);
  const feed = useDeadlineFeed(query, { now, timeZone, weeks: value.weeks });
  const openId = params.get('open');

  const update = useCallback(
    (patch: Partial<DeadlineParams>) =>
      setParams((prev) => deadlineParamsTo({ ...deadlineParamsFrom(prev), ...patch }, prev), { replace: true }),
    [setParams],
  );
  const openListing = useCallback(
    (id: string, replace = false) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('open', id);
          return next;
        },
        // Opening pushes history (Back closes the drawer); swapping listings replaces it.
        { replace: replace || params.has('open') },
      ),
    [setParams, params],
  );
  const closeListing = () => {
    const id = openId;
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('open');
      return next;
    });
    if (id) {
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>(`[data-testid="deadlines-pill"][data-listing-id="${CSS.escape(id)}"]`)?.focus(),
      );
    }
  };

  const order = useMemo(() => timelineOrder(feed.model), [feed.model]);
  const index = openId ? order.indexOf(openId) : -1;
  const prevId = index > 0 ? (order[index - 1] ?? null) : null;
  const nextId = index >= 0 ? (order[index + 1] ?? null) : null;

  const track = (item: TimelineItem) =>
    actions.track({ id: item.id, title: item.title, trackerItemId: item.trackerItemId });

  const toggleType = (type: (typeof OPPORTUNITY_TYPES)[number]) =>
    update({ types: value.types.includes(type) ? value.types.filter((t) => t !== type) : [...value.types, type] });

  useCommandItems(
    () => [
      ...WEEK_OPTIONS.map((weeks) => ({
        id: `deadlines.weeks.${weeks}`,
        group: 'Views',
        label: `Deadlines: next ${weeks} weeks`,
        icon: CalendarDays,
        perform: () => update({ weeks }),
      })),
      {
        id: 'deadlines.saved',
        group: 'Views',
        label: value.savedOnly ? 'Deadlines: show everything' : 'Deadlines: saved only',
        icon: Filter,
        perform: () => update({ savedOnly: !value.savedOnly }),
      },
      ...OPPORTUNITY_TYPES.map((type) => ({
        id: `deadlines.type.${type}`,
        group: 'Views',
        label: `${value.types.includes(type) ? 'Remove' : 'Only'} ${TYPE_META[type].label.toLowerCase()} deadlines`,
        icon: TYPE_META[type].icon,
        perform: () => toggleType(type),
      })),
    ],
     
    [key],
  );

  const typeLabel =
    value.types.length === 0
      ? 'All types'
      : value.types.length === 1
        ? TYPE_META[value.types[0]!].label
        : `${value.types.length} types`;

  return (
    <div data-testid="deadlines-page" className="flex min-h-full flex-col">
      <div ref={headerRef} className="border-b border-border-subtle bg-surface">
        <div className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-gutter py-2 md:px-8">
          <h1 className={phone ? 'sr-only' : 'font-display text-h1 text-fg'}>Deadlines</h1>
          <ViewSwitch
            value="timeline"
            group="deadlines-view"
            showLabels={!phone}
            onChange={(view) => {
              if (view === 'list') void navigate('/radar', { viewTransition: true });
              else if (view === 'board') void navigate('/radar?view=board', { viewTransition: true });
            }}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm" data-testid="deadlines-types">
                {typeLabel}
                <ChevronDown strokeWidth={1.5} aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Types</DropdownMenuLabel>
              {OPPORTUNITY_TYPES.map((type) => {
                const { label, icon: Icon } = TYPE_META[type];
                return (
                  <DropdownMenuCheckboxItem
                    key={type}
                    checked={value.types.includes(type)}
                    onSelect={(event) => event.preventDefault()}
                    onCheckedChange={() => toggleType(type)}
                    data-testid={`deadlines-type-${type}`}
                  >
                    <Icon strokeWidth={1.5} aria-hidden="true" />
                    {label}
                  </DropdownMenuCheckboxItem>
                );
              })}
              {value.types.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem checked={false} onCheckedChange={() => update({ types: [] })}>
                    Show all types
                  </DropdownMenuCheckboxItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <FitThreshold
            value={value.minFit}
            onChange={(minFit) => update({ minFit })}
            count={feed.isPending ? null : feed.model.inWindow}
            pending={feed.isFetching}
            noun={['deadline', 'deadlines']}
            testId="deadlines-fit-threshold"
            countTestId="deadlines-total"
            sliderClassName="w-24"
          />
          <div className="ml-auto flex items-center gap-3">
            <label className="flex items-center gap-2 text-small text-fg-secondary">
              <Switch checked={value.savedOnly} onCheckedChange={(savedOnly) => update({ savedOnly })} data-testid="deadlines-saved-only" />
              Saved only
            </label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" data-testid="deadlines-weeks">
                  {value.weeks} weeks
                  <ChevronDown strokeWidth={1.5} aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup value={String(value.weeks)} onValueChange={(weeks) => update({ weeks: Number(weeks) as WeeksOption })}>
                  {WEEK_OPTIONS.map((weeks) => (
                    <DropdownMenuRadioItem key={weeks} value={String(weeks)}>
                      Next {weeks} weeks
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="flex-1 pt-1">
        <DeadlineTimeline
          feed={feed}
          timeZone={timeZone}
          now={now}
          openId={openId}
          onOpen={(id) => openListing(id)}
          onTrack={track}
          onShowAllTypes={value.types.length || value.savedOnly || value.minFit > 0 ? () => update({ types: [], savedOnly: false, minFit: 0 }) : undefined}
          onMoreWeeks={() => update({ weeks: (value.weeks === 4 ? 8 : 12) })}
          canShowMoreWeeks={value.weeks < 12}
          weeks={value.weeks}
          stickyTop={0}
        />
      </div>

      <ListingDrawer
        listingId={openId}
        onClose={closeListing}
        onOpenListing={(id) => openListing(id, true)}
        prevId={prevId}
        nextId={nextId}
        onPrev={() => prevId && openListing(prevId, true)}
        onNext={() => nextId && openListing(nextId, true)}
        onHide={(listing) => {
          actions.hide(listing);
          if (nextId) openListing(nextId, true);
          else if (prevId) openListing(prevId, true);
          else closeListing();
        }}
        actions={actions}
        timeZone={timeZone}
        aiEnabled={aiEnabled}
        nowMs={nowMs}
      />
    </div>
  );
}
