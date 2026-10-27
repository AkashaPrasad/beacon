import { TableSkeleton, PageHeader } from '@kestrel/ui';

/**
 * Deadlines: /deadlines (week strips, DESIGN §10.3).
 *
 * TODO(wave-3): web-radar replaces this placeholder. Keep this file path, the `Component` export and the
 * `data-testid="deadlines-page"` root; everything else is yours. See docs/WEB.md "How screens plug in".
 */
export function Component() {
  return (
    <div data-testid="deadlines-page" className="flex flex-col">
      <PageHeader title="Deadlines" />
      <TableSkeleton delayMs={0} />
    </div>
  );
}
