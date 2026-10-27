import type { Notification, NotificationKind } from '@kestrel/shared';
import { formatRelative } from '@kestrel/ui';
import { Bell, BellDot, BellRing, CalendarClock, CircleX, Inbox, Info, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { useMe } from '@/api/me';
import { useMarkNotificationsRead, useNotifications } from '@/api/notifications';
import { PushSoftAsk } from '@/components/push-soft-ask';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const KIND_ICON: Record<NotificationKind, LucideIcon> = {
  match: BellRing,
  digest: Inbox,
  deadline: CalendarClock,
  nudge: BellDot,
  source: CircleX,
  system: Info,
};

/** Top-bar bell with the unread count (mono) and the notification centre popover (DESIGN §6.1). */
export function NotificationBell() {
  const { data: me } = useMe();
  const [open, setOpen] = useState(false);
  const unread = me?.unreadNotifications ?? 0;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          data-testid="notifications-bell"
          aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
          className="relative"
        >
          <Bell strokeWidth={1.5} />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 font-mono text-[0.625rem] leading-none font-medium text-accent-fg">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1.5rem))] p-0">
        {open && <NotificationCentre onNavigate={() => setOpen(false)} />}
      </PopoverContent>
    </Popover>
  );
}

function NotificationCentre({ onNavigate }: { onNavigate: () => void }) {
  const { data, isPending, isError, refetch } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const navigate = useNavigate();
  const items = data?.items ?? [];

  const open = (n: Notification) => {
    if (!n.readAt) markRead.mutate({ ids: [n.id] });
    onNavigate();
    if (n.listingId) void navigate(`/radar/${n.listingId}`);
    else if (n.url) void navigate(n.url);
  };

  const list = (filter?: NotificationKind) => {
    const shown = filter ? items.filter((n) => n.kind === filter) : items;
    if (isPending) {
      return (
        <div className="flex flex-col gap-3 p-4" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-4 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      );
    }
    if (isError) {
      return (
        <div className="flex flex-col items-start gap-2 p-4 text-small text-fg-secondary">
          Couldn't load notifications.
          <Button size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      );
    }
    if (!shown.length) {
      return (
        <div className="px-4 py-8 text-center">
          <p className="text-h3 text-fg">All caught up.</p>
          <p className="mt-1 text-small text-fg-secondary">Deadline reminders and nudges will show up here.</p>
        </div>
      );
    }
    return (
      <ul className="max-h-[min(24rem,60vh)] overflow-y-auto overscroll-contain p-1">
        {shown.slice(0, 20).map((n) => {
          const Icon = KIND_ICON[n.kind];
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => open(n)}
                className="flex w-full gap-3 rounded-md px-3 py-2.5 text-left transition-colors duration-fast hover:bg-surface-hover hover:duration-0 focus-visible:focus-ring-inset"
              >
                <Icon className="mt-0.5 size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} aria-hidden="true" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={cn('text-small', n.readAt ? 'text-fg-secondary' : 'font-medium text-fg')}>{n.title}</span>
                  {n.body && <span className="line-clamp-2 text-small text-fg-tertiary">{n.body}</span>}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <time className="font-mono text-mono-sm text-fg-tertiary" dateTime={n.createdAt.toISOString()}>
                    {formatRelative(n.createdAt)}
                  </time>
                  {!n.readAt && <span className="size-1.5 rounded-full bg-accent-strong" aria-label="Unread" />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="flex flex-col">
      <header className="flex items-center justify-between gap-2 px-4 pt-3">
        <h2 className="text-h3 text-fg">Notifications</h2>
        <Button
          size="sm"
          variant="ghost"
          disabled={!data?.unreadCount}
          onClick={() => markRead.mutate({ all: true })}
        >
          Mark all read
        </Button>
      </header>
      <Tabs defaultValue="all" className="gap-0">
        <TabsList className="mx-4 mt-1">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="deadline">Deadlines</TabsTrigger>
          <TabsTrigger value="nudge">Nudges</TabsTrigger>
        </TabsList>
        <TabsContent value="all">{list()}</TabsContent>
        <TabsContent value="deadline">{list('deadline')}</TabsContent>
        <TabsContent value="nudge">{list('nudge')}</TabsContent>
      </Tabs>
      <PushSoftAsk className="border-t border-border-subtle px-4 py-3" />
      <footer className="border-t border-border-subtle px-4 py-2">
        <Link to="/notifications" onClick={onNavigate} className="text-small text-accent-strong hover:underline">
          View all notifications
        </Link>
      </footer>
    </div>
  );
}
