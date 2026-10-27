import {
  BellRing,
  CalendarClock,
  CircleUserRound,
  Radar,
  Rss,
  SquareKanban,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** `g` + key chord (DESIGN §11). */
  chord?: string;
}

/** Top-bar navigation (≥ md), DESIGN §10.1. */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/radar', label: 'Radar', icon: Radar, chord: 'g r' },
  { to: '/deadlines', label: 'Deadlines', icon: CalendarClock, chord: 'g d' },
  { to: '/tracker', label: 'Tracker', icon: SquareKanban, chord: 'g t' },
  { to: '/sources', label: 'Sources', icon: Rss, chord: 'g s' },
  { to: '/alerts', label: 'Alerts', icon: BellRing, chord: 'g a' },
];

/** Mobile tab bar (< md): Radar · Deadlines · Tracker · Me (UX-RESTRUCTURE §1.10). */
export const TAB_ITEMS: readonly NavItem[] = [
  NAV_ITEMS[0]!,
  NAV_ITEMS[1]!,
  NAV_ITEMS[2]!,
  { to: '/me', label: 'Me', icon: CircleUserRound },
];

/** Routes that live under the "Me" tab on phones. */
export const ME_PATHS = [
  '/me',
  '/profile',
  '/sources',
  '/alerts',
  '/settings',
  '/notifications',
  '/admin',
];
