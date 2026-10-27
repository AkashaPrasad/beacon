import { Shortcut } from '@kestrel/ui';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { Briefcase, Clock } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { queryKeys } from '@/api/keys';
import type { FeedResponse } from '@/api/types';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { Kbd } from '@/components/ui/kbd';
import { ariaKeyShortcuts } from '@/lib/shortcuts';

import {
  closePalette,
  readRecentListings,
  takeInitialQuery,
  useCommandItemsSnapshot,
  type CommandItem as Item,
} from './registry';

const GROUP_ORDER = ['Listings', 'Recent', 'Go to', 'Actions', 'Views', 'Settings'];

/**
 * Raycast-style palette (DESIGN §6.1, MOTION §5.12): listings search over the cached feed, recent
 * listings, then registered groups. Selection is instant; results never animate while typing.
 * Lazy-loaded on first open (cmdk is not in the initial bundle).
 */
export function Component({ open }: { open: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const registered = useCommandItemsSnapshot();
  const [query, setQuery] = useState(takeInitialQuery);

  const listings = useMemo(() => {
    if (!open) return [];
    const seen = new Map<string, { id: string; title: string; company: string }>();
    for (const [, data] of qc.getQueriesData<InfiniteData<FeedResponse>>({ queryKey: queryKeys.feed.all })) {
      for (const page of data?.pages ?? []) {
        for (const item of page.items ?? []) {
          if (!seen.has(item.listing.id) && !item.hidden) {
            seen.set(item.listing.id, { id: item.listing.id, title: item.listing.title, company: item.listing.company });
          }
        }
      }
    }
    return [...seen.values()].slice(0, 200);
  }, [open, qc]);

  const recent = useMemo(() => (open ? readRecentListings() : []), [open]);

  const groups = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const item of registered) map.set(item.group, [...(map.get(item.group) ?? []), item]);
    return [...map.entries()].sort(
      ([a], [b]) => (GROUP_ORDER.indexOf(a) + 100) % 100 - ((GROUP_ORDER.indexOf(b) + 100) % 100),
    );
  }, [registered]);

  const run = (perform: () => void) => {
    closePalette();
    perform();
  };
  const openListing = (id: string) => run(() => void navigate(`/radar/${id}`));

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => (next ? undefined : closePalette())}
      title="Command palette"
    >
      <div data-testid="command-palette" className="flex min-h-0 flex-1 flex-col">
        <CommandInput
          data-testid="command-palette-input"
          placeholder="Search listings, jump anywhere, run an action…"
          value={query}
          onValueChange={setQuery}
          trailing={<Kbd>Esc</Kbd>}
        />
        <CommandList aria-live="polite">
          <CommandEmpty>
            {query ? `No matches for “${query}”. Try fewer words.` : 'Type to search listings and commands.'}
          </CommandEmpty>
          {query && listings.length > 0 && (
            <CommandGroup heading="Listings">
              {listings.map((l) => (
                <CommandItem key={l.id} value={`listing ${l.title} ${l.company} ${l.id}`} onSelect={() => openListing(l.id)}>
                  <Briefcase strokeWidth={1.5} />
                  <span className="truncate">{l.title}</span>
                  <span className="truncate text-small text-fg-tertiary">{l.company}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!query && recent.length > 0 && (
            <CommandGroup heading="Recent">
              {recent.map((l) => (
                <CommandItem key={l.id} value={`recent ${l.title} ${l.company}`} onSelect={() => openListing(l.id)}>
                  <Clock strokeWidth={1.5} />
                  <span className="truncate">{l.title}</span>
                  <span className="truncate text-small text-fg-tertiary">{l.company}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {groups.map(([group, items]) => (
            <CommandGroup key={group} heading={group}>
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={item.id}
                    value={`${item.label} ${item.hint ?? ''}`}
                    keywords={item.keywords}
                    onSelect={() => run(item.perform)}
                    aria-keyshortcuts={item.shortcut ? ariaKeyShortcuts(item.shortcut) : undefined}
                  >
                    {Icon && <Icon strokeWidth={1.5} />}
                    <span className="truncate">{item.label}</span>
                    {item.hint && <span className="truncate text-small text-fg-tertiary">{item.hint}</span>}
                    {item.shortcut && (
                      <CommandShortcut>
                        <Shortcut keys={item.shortcut} />
                      </CommandShortcut>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}
        </CommandList>
        <footer className="flex h-10 shrink-0 items-center justify-end gap-4 border-t border-border-subtle px-3 text-caption text-fg-tertiary">
          <span className="flex items-center gap-1.5">
            Open <Kbd>↵</Kbd>
          </span>
          <span className="flex items-center gap-1.5">
            Move <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
          </span>
          <span className="flex items-center gap-1.5">
            Close <Kbd>Esc</Kbd>
          </span>
        </footer>
      </div>
    </CommandDialog>
  );
}
