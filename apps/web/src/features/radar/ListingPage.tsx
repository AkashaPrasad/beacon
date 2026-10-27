// Placeholder (web-foundation): web-radar replaces this with the full listing page (replaces the drawer).
import { DetailPagePlaceholder } from '@/components/detail-page-placeholder';

export function Component() {
  return <DetailPagePlaceholder testId="listing-page" parent={{ label: 'Radar', to: '/radar' }} title="Listing" />;
}
