import type { QueryClient } from '@tanstack/react-query';

import { findFeedItem, patchFeedItem } from './feed';
import { queryKeys } from './keys';
import type { ListingDetail } from './listings';
import type { FeedItemDTO } from './types';

type FeedPatch = Partial<Pick<FeedItemDTO, 'saved' | 'hidden' | 'trackerItemId'>>;

/** Patch a listing in every feed page and in its detail query (used by tracker/alerts mutations). */
export function patchListingEverywhere(qc: QueryClient, listingId: string, patch: FeedPatch): void {
  patchFeedItem(qc, listingId, (item) => ({ ...item, ...patch }));
  qc.setQueryData<ListingDetail>(queryKeys.listing(listingId), (detail) => (detail ? { ...detail, ...patch } : detail));
}

export { findFeedItem as findCachedFeedItem };
