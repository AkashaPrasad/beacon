/**
 * `/me` (phones, UX-RESTRUCTURE §1.10): everything that is not one of the three main tabs — Alerts, Sources,
 * Notifications, Profile, Settings, Admin (admins only), the tour and Sign out — as a calm list of lifted rows.
 * On wider screens the same links live in the top bar and user menu, so this page simply works but is not linked.
 */
import {
  Activity,
  Bell,
  BellRing,
  ChevronRight,
  Compass,
  Keyboard,
  LogOut,
  Rss,
  Settings,
  User,
  type LucideIcon,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router';

import { isAdmin, useMe } from '@/api/me';
import { openSheet } from '@/components/shell/shell-state';
import { ThemeToggle } from '@/components/shell/ThemeToggle';
import { useSignOut } from '@/components/shell/use-sign-out';
import { cn } from '@/lib/utils';
import { PageHeader } from '@kestrel/ui';

interface Row {
  icon: LucideIcon;
  label: string;
  hint?: string;
  to?: string;
  action?: () => void;
  tone?: 'default' | 'danger';
}

const rowClass =
  'press flex h-14 w-full items-center gap-3 px-4 text-left text-body text-fg transition-colors duration-fast hover:bg-surface-hover active:bg-surface-active focus-visible:focus-ring-inset';

export function Component() {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const signOut = useSignOut();
  const initials = (me?.user.name ?? 'You')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const groups: Row[][] = [
    [
      { icon: BellRing, label: 'Alerts', hint: 'Rules and reminders', to: '/alerts' },
      { icon: Rss, label: 'Sources', hint: 'Packs and your own URLs', to: '/sources' },
      { icon: Bell, label: 'Notifications', to: '/notifications' },
    ],
    [
      { icon: User, label: 'Profile', hint: 'Resume, skills, preferences', to: '/profile' },
      {
        icon: Settings,
        label: 'Settings',
        hint: 'Appearance, AI, privacy',
        to: '/settings/appearance',
      },
      ...(isAdmin(me) ? [{ icon: Activity, label: 'Admin', to: '/admin' } as Row] : []),
    ],
    [
      { icon: Compass, label: 'Show me around', action: () => void navigate('/radar?tour=1') },
      { icon: Keyboard, label: 'Keyboard shortcuts', action: () => openSheet('shortcuts') },
      { icon: LogOut, label: 'Sign out', action: () => signOut(), tone: 'danger' },
    ],
  ];

  return (
    <div data-testid="me-page" className="mx-auto flex max-w-2xl flex-col gap-4 pb-8">
      <PageHeader title="Me" hideTitle />
      <section className="e2 mx-gutter flex items-center gap-3 rounded-xl border border-border-subtle p-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent-subtle font-medium text-accent-strong">
          {me?.user.avatarUrl ? (
            <img src={me.user.avatarUrl} alt="" className="size-12 rounded-full object-cover" />
          ) : (
            initials
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body-lg font-semibold text-fg">
            {me?.user.name ?? 'Your account'}
          </p>
          <p className="truncate text-small text-fg-secondary">{me?.user.email ?? ''}</p>
        </div>
        <ThemeToggle />
      </section>
      {groups.map((rows, i) => (
        <ul
          key={i}
          className="e2 mx-gutter divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle"
        >
          {rows.map(({ icon: Icon, label, hint, to, action, tone }) => {
            const body = (
              <>
                <Icon
                  className={cn(
                    'size-5 shrink-0',
                    tone === 'danger' ? 'text-danger' : 'text-fg-secondary',
                  )}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cn(tone === 'danger' && 'text-danger')}>{label}</span>
                  {hint && <span className="truncate text-caption text-fg-tertiary">{hint}</span>}
                </span>
                {to && (
                  <ChevronRight
                    className="size-4 shrink-0 text-fg-tertiary"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                )}
              </>
            );
            return (
              <li key={label}>
                {to ? (
                  <Link to={to} viewTransition className={rowClass}>
                    {body}
                  </Link>
                ) : (
                  <button type="button" onClick={action} className={rowClass}>
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ))}
    </div>
  );
}
