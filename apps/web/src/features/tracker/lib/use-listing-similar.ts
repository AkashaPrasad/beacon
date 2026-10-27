/**
 * "Still open and similar" for the move-on flow (USERFLOW §4.3): the listing detail's `similar`
 * list, from the same cache entry the radar drawer uses (`['listing', id]`, `ListingDetail`).
 */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/api/keys';
import type { ListingDetail } from '@/api/types';
import { api } from '@/lib/api';

export function useListingSimilar(listingId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.listing(listingId ?? ''),
    queryFn: ({ signal }) => api.get<ListingDetail>(`/v1/listings/${encodeURIComponent(listingId ?? '')}`, { signal }),
    enabled: enabled && Boolean(listingId),
    staleTime: 5 * 60_000,
    retry: false,
    select: (d) => d.similar.filter((s) => s.listing.id !== listingId).slice(0, 3),
  });
}
