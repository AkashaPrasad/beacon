import { AlertCircle, Download } from 'lucide-react';
import { AnimatePresence, m, type Variants } from 'motion/react';
import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { useSettings } from '@/api';
import { downloadExport } from '@/api/settings';
import { useCommandItems } from '@/components/command-palette/registry';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { stepVariants, tweens } from '@/features/onboarding/lib/motion';
import { AiTab } from '@/features/settings/components/tabs/AiTab';
import { AppearanceTab } from '@/features/settings/components/tabs/AppearanceTab';
import { NotificationsTab } from '@/features/settings/components/tabs/NotificationsTab';
import { PrivacyTab } from '@/features/settings/components/tabs/PrivacyTab';
import { isSettingsTab, SETTINGS_TAB_META, SETTINGS_TABS, settingsPath, type SettingsTab } from '@/features/settings/lib/tabs';
import { errorMessage } from '@/lib/api';
import { useMediaQuery } from '@/lib/use-media-query';
import type { Settings } from '@kestrel/shared';
import { PageHeader, Skeleton } from '@kestrel/ui';

/** Desktop: panels crossfade in place (peers, not a stack). Mobile: they slide like pushed pages. */
const fadeVariants: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: tweens.fadeIn },
  exit: { opacity: 0, transition: tweens.fadeOut },
};

function PanelSkeleton() {
  return (
    <div className="flex flex-col" aria-busy="true" data-testid="settings-skeleton">
      <div className="flex flex-col gap-2 border-b border-border pb-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3.5 w-64" />
      </div>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="grid gap-3 border-b border-border-subtle py-4 sm:grid-cols-[12.5rem_1fr]">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-36" />
          </div>
          <Skeleton className="h-control w-full max-w-sm rounded-sm" />
        </div>
      ))}
    </div>
  );
}

function PanelError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 py-10" data-testid="settings-error">
      <p className="flex items-center gap-2 text-body font-medium text-fg">
        <AlertCircle className="size-4 text-danger" strokeWidth={1.5} aria-hidden="true" />
        Couldn’t load your settings.
      </p>
      <p className="text-small text-fg-secondary">{errorMessage(error, 'The server didn’t respond. Try again.')}</p>
      <Button variant="secondary" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function Panel({ tab, settings }: { tab: SettingsTab; settings: Settings }) {
  switch (tab) {
    case 'appearance':
      return <AppearanceTab />;
    case 'ai':
      return <AiTab settings={settings} />;
    case 'notifications':
      return <NotificationsTab settings={settings} />;
    case 'privacy':
      return <PrivacyTab settings={settings} />;
  }
}

function SettingsView({ tab }: { tab: SettingsTab }) {
  const navigate = useNavigate();
  const settings = useSettings();
  const desktop = useMediaQuery('(min-width: 1024px)');
  // Direction of travel between tabs, derived when the tab changes (forward +1, back -1).
  const [travel, setTravel] = useState<{ tab: SettingsTab; dir: 1 | -1 }>({ tab, dir: 1 });
  if (travel.tab !== tab) {
    setTravel({ tab, dir: SETTINGS_TABS.indexOf(tab) >= SETTINGS_TABS.indexOf(travel.tab) ? 1 : -1 });
  }

  useCommandItems(
    () => [
      {
        id: 'settings.export',
        group: 'Settings',
        label: 'Export my data (JSON)',
        icon: Download,
        keywords: ['download', 'privacy', 'gdpr'],
        perform: () =>
          void downloadExport()
            .then(() => toast.success('Export downloaded'))
            .catch((error: unknown) => toast.error(errorMessage(error), { duration: 8000 })),
      },
    ],
    [],
  );

  const body =
    tab === 'appearance' ? (
      <AppearanceTab />
    ) : settings.data ? (
      <Panel tab={tab} settings={settings.data} />
    ) : settings.isError ? (
      <PanelError error={settings.error} onRetry={() => void settings.refetch()} />
    ) : (
      <PanelSkeleton />
    );

  return (
    <Tabs
      value={tab}
      onValueChange={(next) => isSettingsTab(next) && void navigate(settingsPath(next), { replace: true })}
      orientation={desktop ? 'vertical' : 'horizontal'}
      className="px-gutter pb-16 lg:flex-row lg:items-start lg:gap-10"
    >
      <TabsList
        aria-label="Settings sections"
        className="scrollbar-none max-lg:-mx-gutter max-lg:w-[calc(100%+2*var(--gutter))] max-lg:max-w-none max-lg:overflow-x-auto max-lg:px-gutter lg:sticky lg:top-[calc(var(--topbar-h)+1.5rem)] lg:w-56 lg:shrink-0"
      >
        {SETTINGS_TABS.map((id) => {
          const meta = SETTINGS_TAB_META[id];
          const Icon = meta.icon;
          return (
            <TabsTrigger
              key={id}
              value={id}
              data-testid={`settings-tab-${id}`}
              className={
                // Vertical list (lg+): a 2 px accent-strong bar on the left of the active row (DESIGN §10.6).
                // The shared indicator's line-variant sizing wins over its vertical sizing, so pin it here.
                'shrink-0 lg:h-9 lg:data-[state=active]:bg-surface-hover lg:[&>span[aria-hidden=true]]:inset-y-1.5! lg:[&>span[aria-hidden=true]]:left-0! lg:[&>span[aria-hidden=true]]:h-auto! lg:[&>span[aria-hidden=true]]:w-0.5!'
              }
            >
              <Icon className="size-4" strokeWidth={1.5} aria-hidden="true" />
              {meta.label}
            </TabsTrigger>
          );
        })}
      </TabsList>

      <div className="relative min-w-0 flex-1 lg:max-w-[45rem]">
        <AnimatePresence initial={false} mode="popLayout" custom={travel.dir}>
          <m.div
            key={tab}
            custom={travel.dir}
            variants={desktop ? fadeVariants : stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="w-full"
          >
            <TabsContent value={tab} forceMount className="pt-2 lg:pt-0" data-testid={`settings-panel-${tab}`}>
              {body}
            </TabsContent>
          </m.div>
        </AnimatePresence>
      </div>
    </Tabs>
  );
}

/**
 * `/settings/:tab` — Appearance · AI & keys · Notifications · Privacy & data (DESIGN §10.6). The tab is
 * the URL, so every section can be linked and the palette's "Settings: …" items land on it. Changes
 * save as they're made; the only Save buttons are for an API key and the consent choice.
 */
export function Component() {
  const { tab } = useParams();
  if (!isSettingsTab(tab)) return <Navigate to={settingsPath('appearance')} replace />;
  return (
    <div data-testid="settings-page" data-tab={tab} className="flex flex-col">
      <PageHeader title="Settings" />
      <SettingsView tab={tab} />
    </div>
  );
}
