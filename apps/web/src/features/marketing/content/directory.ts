/**
 * The public source directory, decoded from the generated tuples (source-directory.data.ts). Shipped
 * only in the /packs chunk and the How-it-works counts; the landing uses `site.ts` numbers instead.
 */
import {
  DIRECTORY_PACKS,
  DIRECTORY_ROWS,
  DIRECTORY_TYPES,
  type DirectoryRow,
} from './source-directory.data';

export type DirectoryType = (typeof DIRECTORY_TYPES)[number];
export type DirectoryPack = (typeof DIRECTORY_PACKS)[number];

/** How Beacon reads a source, cheapest first (the ingestion ladder). */
export type ReadPath = 'ats' | 'api' | 'feed' | 'crawl';

export interface DirectorySource {
  id: string;
  name: string;
  domain: string | null;
  kind: string;
  path: ReadPath;
  types: DirectoryType[];
  country: string;
  verifiedCount: number | null;
  pack: DirectoryPack;
  url: string;
  /** Lower-cased haystack for search. */
  search: string;
}

export const ATS_KINDS = new Set([
  'greenhouse',
  'lever',
  'ashby',
  'smartrecruiters',
  'workable',
  'workday',
]);
const API_KINDS = new Set(['publicapi']);

export const KIND_LABEL: Record<string, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  smartrecruiters: 'SmartRecruiters',
  workable: 'Workable',
  workday: 'Workday',
  rss: 'RSS feed',
  firecrawl: 'Crawled page',
  publicapi: 'Public API',
};

export const TYPE_LABEL: Record<DirectoryType, string> = {
  internship: 'Internships',
  fulltime: 'Full-time',
  hackathon: 'Hackathons',
  scholarship: 'Scholarships',
  fellowship: 'Fellowships',
  research: 'Research',
  opensource: 'Open source',
};

export const PATH_LABEL: Record<ReadPath, string> = {
  ats: 'ATS API',
  api: 'Public API',
  feed: 'Feed',
  crawl: 'Crawler',
};

export function readPathOf(kind: string): ReadPath {
  if (ATS_KINDS.has(kind)) return 'ats';
  if (kind === 'rss') return 'feed';
  if (kind === 'firecrawl') return 'crawl';
  if (API_KINDS.has(kind)) return 'api';
  return 'crawl';
}

export function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1);
}

function decode(row: DirectoryRow, index: number): DirectorySource {
  const [name, domain, kind, mask, country, verifiedCount, packIndex, url] = row;
  const pack = DIRECTORY_PACKS[packIndex] ?? DIRECTORY_PACKS[0];
  const types = DIRECTORY_TYPES.filter((_, bit) => (mask & (1 << bit)) !== 0);
  return {
    id: `${pack.id}-${index}`,
    name,
    domain,
    kind,
    path: readPathOf(kind),
    types,
    country,
    verifiedCount,
    pack,
    url,
    search: `${name} ${domain ?? ''} ${kindLabel(kind)} ${pack.name}`.toLowerCase(),
  };
}

export const DIRECTORY: readonly DirectorySource[] = DIRECTORY_ROWS.map(decode);
export { DIRECTORY_PACKS, DIRECTORY_TYPES };

export function countBy<K extends string>(
  rows: readonly DirectorySource[],
  key: (s: DirectorySource) => K,
): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const row of rows) {
    const k = key(row);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
