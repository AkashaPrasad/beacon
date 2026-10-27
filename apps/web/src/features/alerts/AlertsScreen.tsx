import { ListSkeleton, PageHeader } from '@kestrel/ui';

/**
 * Alerts: /alerts (sentence rule builder, DESIGN §6.1).
 *
 * TODO(wave-3): web-workspace replaces this placeholder. Keep this file path, the `Component` export and the
 * `data-testid="alerts-page"` root; everything else is yours. See docs/WEB.md "How screens plug in".
 */
export function Component() {
  return (
    <div data-testid="alerts-page" className="flex flex-col">
      <PageHeader title="Alerts" />
      <ListSkeleton delayMs={0} />
    </div>
  );
}
