import { Search } from 'lucide-react';
import { LayoutGroup, m } from 'motion/react';
import { Link, NavLink, useMatches } from 'react-router';

import { BeaconMark } from '@/components/brand/BeaconMark';
import { openPalette } from '@/components/command-palette/registry';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { layoutIds, Shortcut, springs } from '@kestrel/ui';

import { NAV_ITEMS } from './nav';
import { NotificationBell } from './NotificationBell';
import { ShellSlotOutlet } from './slots';
import { UserMenu } from './UserMenu';

export interface RouteHandle {
  /** Short section title (mobile top bar, document title). */
  title?: string;
}

function useSectionTitle(): string | undefined {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const handle = matches[i]?.handle as RouteHandle | undefined;
    if (handle?.title) return handle.title;
  }
  return undefined;
}

/**
 * The "instrument strip" (DESIGN §10.1): brand, text tabs with a sliding `accent-strong` underline,
 * a slot for page controls (fit threshold, view switch), search (opens the palette), bell, avatar.
 * It has its own view-transition name, so route changes never animate the chrome (MOTION §5.15).
 */
export function TopBar() {
  const section = useSectionTitle();
  return (
    <header
      style={{ viewTransitionName: 'topbar' }}
      className="sticky top-0 z-topbar border-b border-border-subtle bg-bg pt-safe"
    >
      <div className="flex h-topbar items-center gap-3 px-gutter">
        <Link
          to="/radar"
          viewTransition
          className="flex shrink-0 items-center gap-2 rounded-sm text-fg focus-visible:focus-ring"
          aria-label="Beacon, go to Radar"
        >
          <BeaconMark className="size-6" />
          <span className="hidden font-display text-[1.25rem] leading-none md:inline">Beacon</span>
        </Link>
        {section && <span className="truncate text-h3 text-fg md:hidden">{section}</span>}

        <LayoutGroup id="primary-nav">
          <nav
            aria-label="Primary"
            className="ml-3 hidden items-stretch gap-5 self-stretch md:flex"
          >
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                viewTransition
                className={({ isActive }) =>
                  cn(
                    'relative flex items-center text-body font-medium transition-colors duration-fast focus-visible:focus-ring-inset',
                    isActive ? 'text-fg' : 'text-fg-secondary hover:text-fg',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {item.label}
                    {isActive && (
                      <m.span
                        layoutId={layoutIds.tabIndicator('primary-nav')}
                        transition={springs.snappy}
                        aria-hidden="true"
                        className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent-strong"
                      />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </LayoutGroup>

        <ShellSlotOutlet
          name="topbar"
          className="hidden min-w-0 flex-1 items-center justify-end gap-3 lg:flex"
        />

        <div className="ml-auto flex shrink-0 items-center gap-1 lg:ml-0">
          <button
            type="button"
            onClick={() => openPalette()}
            data-testid="global-search"
            aria-label="Search or jump to…"
            aria-keyshortcuts="Meta+K Control+K"
            className="press hidden h-control-sm w-56 items-center gap-2 rounded-sm border border-border bg-surface-raised px-2.5 text-small text-fg-tertiary hover:border-border-strong focus-visible:focus-ring lg:flex"
          >
            <Search className="size-4" strokeWidth={1.5} aria-hidden="true" />
            <span className="flex-1 text-left">Search or jump…</span>
            <Shortcut keys="mod+k" />
          </button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            aria-label="Search or jump to…"
            onClick={() => openPalette()}
          >
            <Search strokeWidth={1.5} />
          </Button>
          <NotificationBell />
          <div className="hidden md:block">
            <UserMenu />
          </div>
        </div>
      </div>
    </header>
  );
}
