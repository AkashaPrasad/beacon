import {
  Activity,
  Bell,
  BellRing,
  Compass,
  Keyboard,
  LogOut,
  Rss,
  Settings,
  User,
  type LucideIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router';

import { isAdmin, useMe } from '@/api/me';
import { ThemeToggle } from '@/components/shell/ThemeToggle';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';

import { openSheet, useOpenSheet } from './shell-state';
import { useSignOut } from './use-sign-out';

/** Mobile "Me" tab: Alerts, Sources, Notifications, Profile, Settings, Admin (admins), Show me around, Shortcuts, Sign out. */
export function MeSheet() {
  const open = useOpenSheet() === 'me';
  const navigate = useNavigate();
  const { data: me } = useMe();
  const signOut = useSignOut();
  const go = (to: string) => {
    openSheet(null);
    void navigate(to);
  };
  const rows: { icon: LucideIcon; label: string; action: () => void }[] = [
    { icon: BellRing, label: 'Alerts', action: () => go('/alerts') },
    { icon: Rss, label: 'Sources', action: () => go('/sources') },
    { icon: Bell, label: 'Notifications', action: () => go('/notifications') },
    { icon: User, label: 'Profile', action: () => go('/profile') },
    { icon: Settings, label: 'Settings', action: () => go('/settings/appearance') },
    ...(isAdmin(me) ? [{ icon: Activity, label: 'Admin', action: () => go('/admin') }] : []),
    // The spotlight tour listens for `?tour=1` on the radar (features/onboarding/tour).
    { icon: Compass, label: 'Show me around', action: () => go('/radar?tour=1') },
    { icon: Keyboard, label: 'Shortcuts', action: () => openSheet('shortcuts') },
    {
      icon: LogOut,
      label: 'Sign out',
      action: () => {
        openSheet(null);
        signOut();
      },
    },
  ];
  return (
    <Drawer open={open} onOpenChange={(next) => openSheet(next ? 'me' : null)}>
      <DrawerContent handleLabel="Close menu">
        <div className="flex items-center justify-between gap-3 px-4 pt-1 pb-2">
          <div className="min-w-0">
            <DrawerTitle className="truncate">{me?.user.name ?? 'Account'}</DrawerTitle>
            <DrawerDescription className="truncate">{me?.user.email ?? ''}</DrawerDescription>
          </div>
          <ThemeToggle />
        </div>
        <ul className="flex flex-col px-2 pb-4">
          {rows.map(({ icon: Icon, label, action }) => (
            <li key={label}>
              <button
                type="button"
                onClick={action}
                className="press flex h-touch w-full items-center gap-3 rounded-md px-3 text-body text-fg hover:bg-surface-hover active:bg-surface-active focus-visible:focus-ring-inset"
              >
                <Icon className="size-5 text-fg-secondary" strokeWidth={1.5} aria-hidden="true" />
                {label}
              </button>
            </li>
          ))}
        </ul>
      </DrawerContent>
    </Drawer>
  );
}
