import { Bell, Keyboard, LogOut, Rss, Settings, User, type LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router';

import { useMe } from '@/api/me';
import { ThemeToggle } from '@/components/shell/ThemeToggle';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';

import { openSheet, useOpenSheet } from './shell-state';
import { useSignOut } from './use-sign-out';

/** Mobile "Me" tab: Profile, Sources, Settings, Notifications, Shortcuts, Sign out (DESIGN §10.1). */
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
    { icon: User, label: 'Profile', action: () => go('/profile') },
    { icon: Rss, label: 'Sources', action: () => go('/sources') },
    { icon: Settings, label: 'Settings', action: () => go('/settings/appearance') },
    { icon: Bell, label: 'Notifications', action: () => go('/notifications') },
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
                className="flex h-touch w-full items-center gap-3 rounded-md px-3 text-body text-fg active:bg-surface-active focus-visible:focus-ring-inset"
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
