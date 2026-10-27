import { lazy, Suspense, useState } from 'react';

import { useShortcut } from '@/lib/shortcuts';

import { openPalette, togglePalette, usePaletteOpen } from './registry';

const CommandPalette = lazy(() => import('./CommandPalette').then((m) => ({ default: m.Component })));

/** Mounts the palette chunk on first open, keeps it mounted afterwards (instant re-open). */
export function PaletteHost() {
  const open = usePaletteOpen();
  const [loaded, setLoaded] = useState(false);
  if (open && !loaded) setLoaded(true);

  useShortcut('mod+k', () => togglePalette(), {
    description: 'Command palette',
    group: 'General',
    allowInInput: true,
    allowInDialog: true,
  });
  useShortcut('/', () => openPalette(), { description: 'Search', group: 'General' });

  if (!loaded) return null;
  return (
    <Suspense fallback={null}>
      <CommandPalette open={open} />
    </Suspense>
  );
}
