import { Outlet } from 'react-router';

import { FullMotionFeatures } from '@/app/motion-provider';
import { PaletteHost } from '@/components/command-palette/PaletteHost';
import { useShortcut } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';

import { AppearanceSync } from './AppearanceSync';
import { GlobalCommands } from './GlobalCommands';
import { MeSheet } from './MeSheet';
import { OfflineBanner } from './OfflineBanner';
import { toggleRail, useRailCollapsed } from './shell-state';
import { ShortcutsSheet } from './ShortcutsSheet';
import { ShellSlotOutlet, ShellSlotsProvider } from './slots';
import { useShellSlots } from './slots-context';
import { TabBar } from './TabBar';
import { TopBar } from './TopBar';

/**
 * Signed-in layout (DESIGN §10.1): top bar, optional left rail (≥ lg, collapsible to icons, `[`),
 * content on `surface`, optional right drawer column (≥ xl push), mobile tab bar.
 * Screens fill the rail/drawer/top-bar controls with `<ShellSlot>`.
 */
export function Component() {
  return (
    <ShellSlotsProvider>
      <FullMotionFeatures>
        <Layout />
      </FullMotionFeatures>
    </ShellSlotsProvider>
  );
}

function Layout() {
  const slots = useShellSlots();
  const hasRail = (slots?.filled.rail ?? 0) > 0;
  const hasDrawer = (slots?.filled.drawer ?? 0) > 0;
  const railCollapsed = useRailCollapsed();
  useShortcut('[', toggleRail, { description: 'Toggle filter rail', group: 'General', enabled: hasRail });

  return (
    <div data-testid="app-shell" className="flex min-h-dvh flex-col bg-bg">
      <OfflineBanner />
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <aside
          aria-label="Filters"
          data-collapsed={railCollapsed || undefined}
          className={cn(
            'sticky top-(--topbar-h) hidden h-[calc(100dvh-var(--topbar-h))] shrink-0 overflow-y-auto overscroll-contain border-r border-border-subtle bg-bg',
            hasRail && 'lg:block',
            railCollapsed ? 'w-rail-collapsed' : 'w-rail',
          )}
        >
          <ShellSlotOutlet name="rail" className="contents" />
        </aside>
        <main
          id="main"
          tabIndex={-1}
          style={{ viewTransitionName: 'main' }}
          className="min-w-0 flex-1 bg-surface pb-[calc(var(--tabbar-h)+var(--safe-bottom))] outline-none md:pb-0"
        >
          <Outlet />
        </main>
        <div
          className={cn(
            'sticky top-(--topbar-h) hidden h-[calc(100dvh-var(--topbar-h))] w-drawer shrink-0 border-l border-border bg-surface 2xl:w-drawer-wide',
            hasDrawer && 'xl:block',
          )}
        >
          <ShellSlotOutlet name="drawer" className="h-full" />
        </div>
      </div>
      <TabBar />
      <MeSheet />
      <ShortcutsSheet />
      <GlobalCommands />
      <PaletteHost />
      <AppearanceSync />
    </div>
  );
}
