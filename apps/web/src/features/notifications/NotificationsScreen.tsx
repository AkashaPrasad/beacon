import { ListSkeleton, PageHeader } from '@kestrel/ui';

/**
 * Notifications: /notifications (full notification centre; the bell popover is foundation-owned).
 *
 * TODO(wave-3): web-workspace replaces this placeholder. Keep this file path, the `Component` export and the
 * `data-testid="notifications-page"` root; everything else is yours. See docs/WEB.md "How screens plug in".
 */
export function Component() {
  return (
    <div data-testid="notifications-page" className="flex flex-col">
      <PageHeader title="Notifications" />
      <ListSkeleton delayMs={0} />
    </div>
  );
}
