import {
  AlertCircle,
  BellDot,
  BellRing,
  CalendarClock,
  Check,
  CheckCheck,
  CircleX,
  Inbox,
  Info,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';

import { useMe } from '@/api';
import { useMarkCentreRead, useNotificationCentre } from '@/api/notifications';
import { useCommandItems } from '@/components/command-palette/registry';
import { PushSoftAsk } from '@/components/push-soft-ask';
import { Button } from '@/components/ui/button';
import { groupByDay, targetOf, timeOfDay } from '@/features/notifications/lib/group';
import { chipMotion, springs, tweens } from '@/features/onboarding/lib/motion';
import { SegmentedControl } from '@/features/settings/components/controls/SegmentedControl';
import { browserTimeZone } from '@/features/settings/lib/timezones';
import { errorMessage } from '@/lib/api';
import type { Notification, NotificationKind } from '@kestrel/shared';
import { cn, EmptyState, formatAbsolute, formatRelative, PageHeader, Skeleton } from '@kestrel/ui';

type Filter = 'all' | 'unread' | 'deadline' | 'nudge';

const KIND_ICON: Record<NotificationKind, LucideIcon> = {
  match: BellRing,
  digest: Inbox,
  deadline: CalendarClock,
  nudge: BellDot,
  source: CircleX,
  system: Info,
};

const KIND_LABEL: Record<NotificationKind, string> = {
  match: 'New fit',
  digest: 'Digest',
  deadline: 'Deadline',
  nudge: 'Tracker nudge',
  source: 'Source',
  system: 'Beacon',
};

const EMPTY: Record<Filter, { title: string; body: string }> = {
  all: { title: 'All caught up.', body: 'Deadline reminders and nudges will show up here.' },
  unread: { title: 'Nothing unread.', body: 'New fits, deadlines and nudges appear here as they happen.' },
  deadline: { title: 'No deadline reminders.', body: 'Save or track a listing to get reminders 7, 3 and 1 day before it closes.' },
  nudge: { title: 'No tracker nudges.', body: 'Applied roles get a follow-up nudge after 10 quiet days.' },
};

function NotificationsSkeleton() {
  return (
    <div className="flex flex-col gap-1" aria-busy="true" data-testid="notifications-skeleton">
      <Skeleton className="mb-2 h-3 w-16" />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex gap-3 px-3 py-3">
          <Skeleton className="size-8 rounded-md" />
          <div className="flex flex-1 flex-col gap-2 pt-0.5">
            <Skeleton className={cn('h-3.5', i % 2 ? 'w-2/3' : 'w-3/4')} />
            <Skeleton className="h-3 w-2/5" />
          </div>
          <Skeleton className="h-3 w-10" />
        </div>
      ))}
    </div>
  );
}

function NotificationRow({
  n,
  timeZone,
  now,
  onOpen,
  onMarkRead,
}: {
  n: Notification;
  timeZone: string;
  now: Date;
  onOpen: (n: Notification) => void;
  onMarkRead: (n: Notification) => void;
}) {
  const Icon = KIND_ICON[n.kind];
  const unread = !n.readAt;
  const recent = now.getTime() - n.createdAt.getTime() < 12 * 3_600_000;
  return (
    <m.li layout="position" transition={{ layout: springs.gentle }} className="group relative" data-testid="notifications-item" data-id={n.id} data-read={!unread}>
      <button
        type="button"
        onClick={() => onOpen(n)}
        data-notification-row=""
        className={cn(
          'flex w-full items-start gap-3 rounded-md px-3 py-3 text-left transition-colors duration-fast hover:bg-surface-hover hover:duration-0 focus-visible:focus-ring-inset',
          unread && 'pr-12',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-md',
            unread ? 'bg-accent-subtle text-accent-subtle-fg' : 'bg-surface-sunken text-fg-secondary',
          )}
        >
          <Icon className="size-4" strokeWidth={1.5} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="sr-only">{KIND_LABEL[n.kind]}: </span>
          <span className={cn('text-body', unread ? 'font-medium text-fg' : 'text-fg-secondary')}>{n.title}</span>
          {n.body && <span className="line-clamp-2 text-small text-fg-tertiary">{n.body}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-2 pt-0.5">
          <time
            dateTime={n.createdAt.toISOString()}
            title={formatAbsolute(n.createdAt, timeZone)}
            className="font-mono text-mono-sm text-fg-tertiary"
          >
            {recent ? formatRelative(n.createdAt, now) : timeOfDay(n.createdAt, timeZone)}
          </time>
          <AnimatePresence initial={false}>
            {unread && (
              <m.span
                key="dot"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1, transition: springs.snappy }}
                exit={{ scale: 0, opacity: 0, transition: tweens.exit }}
                className="size-1.5 rounded-full bg-accent-strong"
                data-testid="notifications-unread-dot"
              >
                <span className="sr-only">Unread</span>
              </m.span>
            )}
          </AnimatePresence>
        </span>
      </button>
      {unread && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Mark “${n.title}” as read`}
          onClick={() => onMarkRead(n)}
          data-testid="notifications-mark-read"
          className="absolute top-1/2 right-2 -translate-y-1/2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
        >
          <Check className="size-4" strokeWidth={1.5} />
        </Button>
      )}
    </m.li>
  );
}

/**
 * `/notifications` — the full notification centre (DESIGN §6.1, USERFLOW §6): grouped by day in your time
 * zone, unread dots, mark one or all as read, and every item opens what it's about. ↑ ↓ move between
 * items. The bell's popover is the quick view; this is the archive.
 */
export function Component() {
  const me = useMe();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const query = useNotificationCentre({ unreadOnly: filter === 'unread' });
  const markRead = useMarkCentreRead();
  const timeZone = me.data?.settings.timezone ?? browserTimeZone();
  const [now, setNow] = useState(() => new Date());
  const sentinel = useRef<HTMLDivElement>(null);

  // Keep relative times honest without re-rendering every second.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const items = useMemo(() => {
    const seen = new Set<string>();
    const all = (query.data?.pages ?? []).flatMap((p) => p.items).filter((n) => !seen.has(n.id) && Boolean(seen.add(n.id)));
    return filter === 'deadline' || filter === 'nudge' ? all.filter((n) => n.kind === filter) : all;
  }, [query.data, filter]);
  const groups = useMemo(() => groupByDay(items, timeZone, now), [items, timeZone, now]);
  const unread = query.data?.pages[0]?.unreadCount ?? me.data?.unreadNotifications ?? 0;

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
    }, { rootMargin: '240px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, groups.length]);

  const markAll = () => markRead.mutate({ all: true });

  useCommandItems(
    () => [
      { id: 'notifications.mark-all', group: 'Actions', label: 'Mark all notifications read', icon: CheckCheck, perform: markAll },
    ],
    [],  
  );

  function open(n: Notification) {
    if (!n.readAt) markRead.mutate({ ids: [n.id] });
    const to = targetOf(n);
    if (to) void navigate(to);
  }

  /** ↑/↓ (and j/k) move focus between rows: the list is one long column of buttons. */
  function onListKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const keys = { ArrowDown: 1, ArrowUp: -1, j: 1, k: -1 } as Record<string, number>;
    const delta = keys[e.key];
    if (!delta || e.metaKey || e.ctrlKey || e.altKey) return;
    const rows = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[data-notification-row]')];
    const index = rows.indexOf(document.activeElement as HTMLButtonElement);
    const next = rows[index === -1 ? 0 : Math.min(rows.length - 1, Math.max(0, index + delta))];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  }

  let body;
  if (query.isPending) body = <NotificationsSkeleton />;
  else if (query.isError && items.length === 0) {
    body = (
      <div role="alert" className="flex flex-col items-start gap-3 py-10" data-testid="notifications-error">
        <p className="flex items-center gap-2 text-body font-medium text-fg">
          <AlertCircle className="size-4 text-danger" strokeWidth={1.5} aria-hidden="true" />
          Couldn’t load notifications.
        </p>
        <p className="text-small text-fg-secondary">{errorMessage(query.error)}</p>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    );
  } else if (items.length === 0) {
    body = (
      <EmptyState
        icon={Inbox}
        title={EMPTY[filter].title}
        body={EMPTY[filter].body}
        variant={filter === 'all' ? 'page' : 'inline'}
        data-testid="notifications-empty"
        data-variant={filter}
        action={
          filter !== 'all' ? (
            <Button variant="secondary" size="sm" onClick={() => setFilter('all')}>
              Show all
            </Button>
          ) : undefined
        }
      />
    );
  } else {
    body = (
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: tweens.fadeIn }}
        className="flex flex-col gap-4"
        data-testid="notifications-list"
        onKeyDown={onListKeyDown}
      >
        {groups.map((g) => (
          <section key={g.key} aria-labelledby={`day-${g.key}`} data-testid="notifications-day">
            <h2
              id={`day-${g.key}`}
              className="sticky top-(--topbar-h) z-sticky -mx-3 bg-surface/95 px-3 py-2 text-label uppercase text-fg-tertiary"
            >
              {g.label}
              <span className="ml-2 font-mono text-mono-sm normal-case">{g.items.length}</span>
            </h2>
            <ul className="flex flex-col">
              <AnimatePresence initial={false} mode="popLayout">
                {g.items.map((n) => (
                  <NotificationRow
                    key={n.id}
                    n={n}
                    timeZone={timeZone}
                    now={now}
                    onOpen={open}
                    onMarkRead={(x) => markRead.mutate({ ids: [x.id] })}
                  />
                ))}
              </AnimatePresence>
            </ul>
          </section>
        ))}
        <div ref={sentinel} className="flex justify-center py-2">
          {hasNextPage && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
              data-testid="notifications-load-more"
            >
              {isFetchingNextPage && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" strokeWidth={1.5} aria-hidden="true" />}
              {isFetchingNextPage ? 'Loading older…' : 'Show older'}
            </Button>
          )}
        </div>
      </m.div>
    );
  }

  return (
    <div data-testid="notifications-page" className="flex flex-col">
      <PageHeader
        title="Notifications"
        meta={
          <span data-testid="notifications-unread-count">
            {unread > 0 ? `${unread.toLocaleString('en-IN')} unread` : 'all read'}
          </span>
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={markAll}
            disabled={unread === 0 || markRead.isPending}
            data-testid="notifications-mark-all"
          >
            <CheckCheck className="size-4" strokeWidth={1.5} aria-hidden="true" />
            Mark all read
          </Button>
        }
      />
      <div className="px-gutter pb-16">
        <div className="flex w-full max-w-3xl flex-col gap-4">
          <div className="scrollbar-none -mx-gutter overflow-x-auto px-gutter">
            <SegmentedControl<Filter>
              aria-label="Show"
              size="sm"
              value={filter}
              data-testid="notifications-filter"
              options={[
                { value: 'all', label: 'All' },
                { value: 'unread', label: unread > 0 ? `Unread ${unread}` : 'Unread' },
                { value: 'deadline', label: 'Deadlines' },
                { value: 'nudge', label: 'Nudges' },
              ]}
              onChange={setFilter}
            />
          </div>
          <AnimatePresence initial={false}>
            {filter === 'all' && (
              <m.div key="ask" {...chipMotion} className="empty:hidden">
                <PushSoftAsk className="rounded-md border border-border bg-surface-raised p-3" />
              </m.div>
            )}
          </AnimatePresence>
          {body}
        </div>
      </div>
    </div>
  );
}
