import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

import { queryKeys } from './keys';
import type { AdminOverview } from './types';

/**
 * Ops overview for `/admin` (`GET /v1/admin/overview`, role `admin`). Refreshes every 30 s while the
 * tab is visible; never persisted (ops numbers are only useful fresh).
 */
export function useAdminOverview(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.admin.overview,
    queryFn: ({ signal }) => api.get<AdminOverview>('/v1/admin/overview', { signal }),
    enabled: options.enabled ?? true,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
    meta: { persist: false },
  });
}
