/**
 * The live effect line ("≈ 1,240 open fits so far"): `GET /v1/feed?limit=1` with the answers so far,
 * debounced 300 ms, shown only when the number is worth showing (≥ 20, UX audit A6).
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import type { FeedResponse } from '@/api/types';
import { SPECIAL_LOCATIONS } from '@/features/onboarding/lib/preferences';
import { primaryGradYear, type ProfileDraft } from '@/features/profile/lib/profile-model';
import { api } from '@/lib/api';

export const LIVE_FITS_MIN = 20;

export function liveFitsQuery(d: ProfileDraft): Record<string, string> {
  const q: Record<string, string> = { limit: '1' };
  if (d.opportunityTypes.length > 0) q.types = d.opportunityTypes.join(',');
  if (d.remotePref === 'remote_only') q.remote = 'remote';
  const cities = d.preferredLocations.filter(
    (l) => !(SPECIAL_LOCATIONS as readonly string[]).includes(l),
  );
  if (cities.length > 0 && d.remotePref !== 'remote_only') q.locations = cities.join(',');
  if (d.stipendFloor && d.stipendFloor.amount > 0) {
    q.minStipend = String(d.stipendFloor.amount);
    q.stipendCurrency = d.stipendFloor.currency;
  }
  const year = primaryGradYear(d);
  if (year) q.gradYear = String(year);
  return q;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** `total` for the draft (null while unknown). */
export function useLiveFits(draft: ProfileDraft | null): number | null {
  const query = draft ? liveFitsQuery(draft) : null;
  const key = useDebounced(query ? JSON.stringify(query) : null, 300);
  const res = useQuery({
    queryKey: ['onboarding', 'live-fits', key],
    queryFn: ({ signal }) =>
      api.get<FeedResponse>('/v1/feed', {
        signal,
        query: JSON.parse(key ?? '{}') as Record<string, string>,
      }),
    enabled: Boolean(key),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    meta: { persist: false },
  });
  return typeof res.data?.total === 'number' ? res.data.total : null;
}
