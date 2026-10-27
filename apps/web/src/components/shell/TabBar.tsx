import { LayoutGroup, m } from 'motion/react';
import { NavLink, useLocation } from 'react-router';

import { cn } from '@/lib/utils';
import { layoutIds, springs } from '@kestrel/ui';

import { ME_PATHS, TAB_ITEMS } from './nav';

/**
 * Mobile tab bar (< md): Radar · Deadlines · Tracker · Alerts · Me. `bg/90` with the one allowed blur,
 * 56 px items plus the safe-area inset, a sliding 2 px top indicator. Re-tapping the active tab scrolls
 * to the top (MOTION §4).
 */
export function TabBar() {
  const { pathname } = useLocation();
  const meActive = ME_PATHS.some((p) => pathname.startsWith(p));
  return (
    <nav
      aria-label="Primary"
      style={{ viewTransitionName: 'tabbar' }}
      className="glass fixed inset-x-0 bottom-0 z-topbar border-t pb-safe md:hidden"
    >
      <LayoutGroup id="tabbar">
        <ul className="grid h-tabbar grid-cols-5">
          {TAB_ITEMS.map((item) => {
            const Icon = item.icon;
            const isMe = item.to === '/me';
            const active = isMe ? meActive : pathname.startsWith(item.to);
            const content = (
              <>
                {active && (
                  <m.span
                    layoutId={layoutIds.tabIndicator('tabbar')}
                    transition={springs.snappy}
                    aria-hidden="true"
                    className="absolute inset-x-3 inset-y-1.5 -z-10 rounded-lg bg-accent-subtle"
                  />
                )}
                <Icon className="press-icon size-5" strokeWidth={1.5} aria-hidden="true" />
                <span className="text-caption">{item.label}</span>
              </>
            );
            const classes = cn(
              'relative flex h-full flex-col items-center justify-center gap-0.5 focus-visible:focus-ring-inset',
              active ? 'text-accent-strong' : 'text-fg-tertiary',
            );
            return (
              <li key={item.to}>
                {isMe ? (
                  <NavLink to="/me" className={classes} aria-current={active ? 'page' : undefined}>
                    {content}
                  </NavLink>
                ) : (
                  <NavLink
                    to={item.to}
                    className={classes}
                    onClick={() => {
                      if (active) window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  >
                    {content}
                  </NavLink>
                )}
              </li>
            );
          })}
        </ul>
      </LayoutGroup>
    </nav>
  );
}
