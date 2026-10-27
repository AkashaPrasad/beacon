import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider, type Persister } from '@tanstack/react-query-persist-client';
import { useEffect, type ReactNode } from 'react';
import { RouterProvider, type createBrowserRouter } from 'react-router';

import { TooltipProvider } from '@/components/ui/tooltip';
import { persistOptions } from '@/lib/query-client';
import { installShortcutListener } from '@/lib/shortcuts';
import { ThemeProvider } from '@/lib/theme/ThemeProvider';

import { MotionProvider } from './motion-provider';

type Router = ReturnType<typeof createBrowserRouter>;

function QueryProvider({ client, persister, children }: { client: QueryClient; persister?: Persister; children: ReactNode }) {
  useEffect(() => {
    if (!persister) return undefined;
    // Signing out wipes the persisted cache too (privacy: shared computers).
    const onSignOut = () => void persister.removeClient();
    window.addEventListener('beacon:signed-out', onSignOut);
    return () => window.removeEventListener('beacon:signed-out', onSignOut);
  }, [persister]);
  if (!persister) return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return (
    <PersistQueryClientProvider client={client} persistOptions={persistOptions(persister)}>
      {children}
    </PersistQueryClientProvider>
  );
}

export interface AppProps {
  router: Router;
  queryClient: QueryClient;
  /** IndexedDB persister in the browser; omitted for prerender and tests. */
  persister?: Persister;
}

/** Provider stack shared by the browser entry, the prerenderer and tests. */
export function App({ router, queryClient, persister }: AppProps) {
  useEffect(() => installShortcutListener(), []);
  return (
    <ThemeProvider>
      <MotionProvider>
        <QueryProvider client={queryClient} persister={persister}>
          <TooltipProvider>
            <RouterProvider router={router} />
          </TooltipProvider>
        </QueryProvider>
      </MotionProvider>
    </ThemeProvider>
  );
}
