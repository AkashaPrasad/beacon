import { ListSkeleton, PageHeader } from '@kestrel/ui';
import { useParams } from 'react-router';

/**
 * Radar: /radar and /radar/:listingId (drawer open state = `useParams().listingId`; open with `navigate(`/radar/${id}`)`, close with `navigate("/radar")`, keep `location.search` for filters).
 *
 * TODO(wave-3): web-radar replaces this placeholder. Keep this file path, the `Component` export and the
 * `data-testid="radar-page"` root; everything else is yours. See docs/WEB.md "How screens plug in".
 */
export function Component() {
  const { listingId } = useParams();
  return (
    <div data-testid="radar-page" data-listing-id={listingId} className="flex flex-col">
      <PageHeader title="Radar" />
      <ListSkeleton delayMs={0} />
    </div>
  );
}
