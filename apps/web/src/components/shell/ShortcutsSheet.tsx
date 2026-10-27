import { Shortcut } from '@kestrel/ui';
import { useMemo } from 'react';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useShortcutList } from '@/lib/shortcuts';

import { openSheet, useOpenSheet } from './shell-state';

const GROUP_ORDER = ['General', 'Go to', 'Radar', 'Deadlines', 'Tracker'];

/** `?` sheet: every described shortcut, grouped, two columns, Kbd chips (DESIGN §11). */
export function ShortcutsSheet() {
  const open = useOpenSheet() === 'shortcuts';
  const list = useShortcutList();
  const groups = useMemo(() => {
    const map = new Map<string, { keys: string; description: string }[]>();
    for (const def of list) {
      const group = def.group ?? 'General';
      map.set(group, [...(map.get(group) ?? []), { keys: def.keys, description: def.description ?? '' }]);
    }
    return [...map.entries()].sort(
      ([a], [b]) => (GROUP_ORDER.indexOf(a) + 100) % 100 - ((GROUP_ORDER.indexOf(b) + 100) % 100),
    );
  }, [list]);

  return (
    <Dialog open={open} onOpenChange={(next) => openSheet(next ? 'shortcuts' : null)}>
      <DialogContent className="sm:max-w-2xl" data-testid="shortcuts-sheet">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Single-key shortcuts pause while you type. You can turn them off in Settings.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[60vh] gap-x-8 gap-y-5 overflow-y-auto sm:grid-cols-2">
          {groups.map(([group, items]) => (
            <section key={group} aria-label={group}>
              <h3 className="mb-1.5 text-label uppercase text-fg-tertiary">{group}</h3>
              <dl className="flex flex-col">
                {items.map((item) => (
                  <div
                    key={item.keys}
                    className="flex items-center justify-between gap-4 border-b border-border-subtle py-1.5 last:border-0"
                  >
                    <dt className="text-small text-fg">{item.description}</dt>
                    <dd>
                      <Shortcut keys={item.keys} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
