import { Construction } from 'lucide-react';

import { EmptyState } from '@kestrel/ui';

import { DetailPageHeader } from './detail-page-header';

/**
 * Stand-in for a detail page a screen agent has not landed yet: the route, Back and breadcrumb work,
 * so links into it never dead-end. Replace the route's module with the real page (same `Component`).
 */
export function DetailPagePlaceholder({
  testId,
  parent,
  title,
}: {
  testId: string;
  parent: { label: string; to: string };
  title: string;
}) {
  return (
    <div data-testid={testId} data-placeholder="true" className="flex flex-col pb-10">
      <DetailPageHeader parent={parent} trail={[title]} title={title} />
      <EmptyState
        icon={Construction}
        title="This page is on its way."
        body={`Everything here is still reachable from ${parent.label} while the full page is finished.`}
      />
    </div>
  );
}
