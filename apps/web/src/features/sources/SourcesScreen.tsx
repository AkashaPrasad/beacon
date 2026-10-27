import { SourcesView } from './components/SourcesView';

/**
 * Sources: /sources (table + packs + add-source dialog; `?add=1` opens the dialog, `?add=<url>`
 * prefills it, `?tab=packs` opens the Packs tab). DESIGN §10.5, USERFLOW §5.1.
 */
export function Component() {
  return (
    <div data-testid="sources-page" className="flex min-h-0 flex-col">
      <SourcesView />
    </div>
  );
}
