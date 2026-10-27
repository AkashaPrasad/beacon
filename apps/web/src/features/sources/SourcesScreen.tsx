import { TableSkeleton, PageHeader } from '@kestrel/ui';

/**
 * Sources: /sources (table + add-source dialog; `?add=1` opens the dialog, DESIGN §10.5).
 *
 * TODO(wave-3): web-workspace replaces this placeholder. Keep this file path, the `Component` export and the
 * `data-testid="sources-page"` root; everything else is yours. See docs/WEB.md "How screens plug in".
 */
export function Component() {
  return (
    <div data-testid="sources-page" className="flex flex-col">
      <PageHeader title="Sources" />
      <TableSkeleton delayMs={0} />
    </div>
  );
}
