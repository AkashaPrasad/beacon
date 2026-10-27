import { useParams } from 'react-router';

import { TableSkeleton, PageHeader } from '@kestrel/ui';

/**
 * Settings: /settings/:tab (appearance | ai | notifications | privacy, DESIGN §10.6).
 *
 * TODO(wave-3): web-workspace replaces this placeholder. Keep this file path, the `Component` export and the
 * `data-testid="settings-page"` root; everything else is yours. See docs/WEB.md "How screens plug in".
 */
export function Component() {
  const { tab = 'appearance' } = useParams();
  return (
    <div data-testid="settings-page" data-tab={tab} className="flex flex-col">
      <PageHeader title="Settings" />
      <TableSkeleton delayMs={0} />
    </div>
  );
}
