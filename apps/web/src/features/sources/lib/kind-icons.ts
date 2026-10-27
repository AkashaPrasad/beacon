import type { SourceKind } from '@kestrel/shared';
import { Braces, Globe, Network, Plug, Rss, Search, type LucideIcon } from 'lucide-react';

/** ATS (free API) · public API · feed · crawler (credits). lucide only (DESIGN §7). */
export const KIND_ICONS: Record<SourceKind, LucideIcon> = {
  greenhouse: Plug,
  lever: Plug,
  ashby: Plug,
  smartrecruiters: Plug,
  workable: Plug,
  workday: Plug,
  publicapi: Braces,
  rss: Rss,
  sitemap: Network,
  firecrawl: Globe,
  jobspy: Search,
};
