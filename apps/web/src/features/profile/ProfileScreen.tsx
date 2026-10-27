import { TableSkeleton, PageHeader } from '@kestrel/ui';

/**
 * Profile: /profile (ledger + "what recruiters see", DESIGN §6.1).
 *
 * TODO(wave-3): web-workspace replaces this placeholder. Keep this file path, the `Component` export and the
 * `data-testid="profile-page"` root; everything else is yours. See docs/WEB.md "How screens plug in".
 */
export function Component() {
  return (
    <div data-testid="profile-page" className="flex flex-col">
      <PageHeader title="Profile" />
      <TableSkeleton delayMs={0} />
    </div>
  );
}
