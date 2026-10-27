import { CardSkeleton, PageHeader } from '@kestrel/ui';

/**
 * Tracker: /tracker (Kanban + table, DESIGN §10.4).
 *
 * TODO(wave-3): web-workspace replaces this placeholder. Keep this file path, the `Component` export and the
 * `data-testid="tracker-page"` root; everything else is yours. See docs/WEB.md "How screens plug in".
 */
export function Component() {
  return (
    <div data-testid="tracker-page" className="flex flex-col">
      <PageHeader title="Tracker" />
      <CardSkeleton delayMs={0} />
    </div>
  );
}
