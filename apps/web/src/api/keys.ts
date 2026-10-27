import type { FeedFilters } from './types';

/**
 * Query-key factory. Invalidate by prefix: `qc.invalidateQueries({ queryKey: queryKeys.feed.all })`.
 * Screen agents add keys here rather than inventing ad-hoc arrays.
 */
export const queryKeys = {
  me: ['me'] as const,
  settings: ['settings'] as const,
  profile: ['profile'] as const,
  /** Same keys as `feedKeys` in ./feed. */
  feed: {
    all: ['feed'] as const,
    list: (filters: FeedFilters) => ['feed', 'list', filters] as const,
    summary: ['feed', 'summary'] as const,
  },
  listing: (id: string) => ['listing', id] as const,
  explanation: (id: string) => ['listing', id, 'explain'] as const,
  sources: {
    all: ['sources'] as const,
    mine: ['sources', 'mine'] as const,
    packs: ['sources', 'packs'] as const,
    community: (params: Record<string, unknown>) => ['sources', 'community', params] as const,
    credits: ['sources', 'credits'] as const,
    detect: (url: string) => ['sources', 'detect', url] as const,
  },
  tracker: {
    all: ['tracker'] as const,
    list: ['tracker', 'list'] as const,
    analytics: ['tracker', 'analytics'] as const,
  },
  alerts: ['alerts'] as const,
  notifications: {
    all: ['notifications'] as const,
    list: (unreadOnly = false) => ['notifications', 'list', { unreadOnly }] as const,
  },
  push: { subscriptions: ['push', 'subscriptions'] as const },
} as const;
