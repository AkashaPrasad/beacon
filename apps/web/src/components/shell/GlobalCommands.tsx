import { Activity, Bell, Keyboard, LogOut, Moon, Plus, Settings, User } from 'lucide-react';
import { useNavigate } from 'react-router';

import { isAdmin, useMe } from '@/api/me';
import { useCommandItems } from '@/components/command-palette/registry';
import { useShortcut } from '@/lib/shortcuts';
import { useTheme } from '@/lib/theme/context';
import { undoLast } from '@/lib/undo';

import { NAV_ITEMS } from './nav';
import { openSheet } from './shell-state';
import { useSignOut } from './use-sign-out';

/**
 * App-wide shortcuts (DESIGN §11) and the built-in palette items. Screens add their own with
 * `useShortcut(..., { scope })` and `useCommandItems(...)`.
 */
export function GlobalCommands() {
  const navigate = useNavigate();
  const { toggleTheme } = useTheme();
  const signOut = useSignOut();
  const { data: me } = useMe();
  const admin = isAdmin(me);
  const go = (to: string) => void navigate(to, { viewTransition: true });

  useShortcut('g r', () => go('/radar'), { description: 'Go to Radar', group: 'Go to' });
  useShortcut('g d', () => go('/deadlines'), { description: 'Go to Deadlines', group: 'Go to' });
  useShortcut('g t', () => go('/tracker'), { description: 'Go to Tracker', group: 'Go to' });
  useShortcut('g s', () => go('/sources'), { description: 'Go to Sources', group: 'Go to' });
  useShortcut('g a', () => go('/alerts'), { description: 'Go to Alerts', group: 'Go to' });
  useShortcut('g p', () => go('/profile'), { description: 'Go to Profile', group: 'Go to' });
  useShortcut('g ,', () => go('/settings/appearance'), {
    description: 'Go to Settings',
    group: 'Go to',
  });
  useShortcut('?', () => openSheet('shortcuts'), {
    description: 'Keyboard shortcuts',
    group: 'General',
  });
  useShortcut('u', () => undoLast(), { description: 'Undo last action', group: 'General' });
  useShortcut(
    'mod+z',
    (e) => {
      if (!undoLast()) e.preventDefault();
    },
    { group: 'General' },
  );

  useCommandItems(
    () => [
      ...NAV_ITEMS.map((item) => ({
        id: `go.${item.to}`,
        group: 'Go to',
        label: item.label,
        icon: item.icon,
        shortcut: item.chord,
        perform: () => go(item.to),
      })),
      {
        id: 'go.profile',
        group: 'Go to',
        label: 'Profile',
        icon: User,
        shortcut: 'g p',
        perform: () => go('/profile'),
      },
      {
        id: 'go.notifications',
        group: 'Go to',
        label: 'Notifications',
        icon: Bell,
        perform: () => go('/notifications'),
      },
      ...(admin
        ? [
            {
              id: 'go.admin',
              group: 'Go to',
              label: 'Admin',
              hint: 'Ops overview',
              keywords: ['ops', 'queues', 'crawler', 'health'],
              icon: Activity,
              perform: () => go('/admin'),
            },
          ]
        : []),
      {
        id: 'action.add-source',
        group: 'Actions',
        label: 'Add source',
        keywords: ['url', 'careers', 'greenhouse', 'lever'],
        icon: Plus,
        perform: () => go('/sources?add=1'),
      },
      {
        id: 'action.theme',
        group: 'Actions',
        label: 'Toggle theme',
        keywords: ['dark', 'light'],
        icon: Moon,
        perform: toggleTheme,
      },
      {
        id: 'action.shortcuts',
        group: 'Actions',
        label: 'Keyboard shortcuts',
        icon: Keyboard,
        shortcut: '?',
        perform: () => openSheet('shortcuts'),
      },
      {
        id: 'action.sign-out',
        group: 'Actions',
        label: 'Sign out',
        icon: LogOut,
        perform: signOut,
      },
      ...(['appearance', 'ai', 'notifications', 'privacy'] as const).map((tab) => ({
        id: `settings.${tab}`,
        group: 'Settings',
        label: {
          appearance: 'Appearance',
          ai: 'AI & keys',
          notifications: 'Notifications',
          privacy: 'Privacy & data',
        }[tab],
        icon: Settings,
        perform: () => go(`/settings/${tab}`),
      })),
    ],

    [toggleTheme, admin],
  );
  return null;
}
