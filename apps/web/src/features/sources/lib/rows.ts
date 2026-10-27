/**
 * Sources table view model (pure): personal sources + subscribed community sources → one row list
 * with display health, pack names and capabilities (community rows are shared: read-only here).
 */
import type { OpportunityType, RefreshInterval, SourceHealth, SourceKind } from '@kestrel/shared';

import { displayHealth, healthCodeOf, healthReason, type CreditMode, type DisplayHealth } from './health';

import type { CommunityRow, PackDTO, SourceRow } from '@/api/sources';

export interface SourceTableRow {
  id: string;
  name: string;
  url: string;
  domain: string | null;
  kind: SourceKind;
  scope: 'personal' | 'pack';
  packId: string | null;
  packName: string | null;
  typeTag: OpportunityType | null;
  refreshInterval: RefreshInterval;
  lastCheckedAt: Date | string | null;
  listingsFound: number;
  status: DisplayHealth;
  /** Worker health (`data-health`). */
  health: SourceHealth;
  /** `data-health-code` (e.g. `paused:credits`). */
  healthCode: string;
  reason: string;
  enabled: boolean;
  /** Personal rows can be edited, refreshed and deleted; pack rows are shared. */
  editable: boolean;
  optimistic: boolean;
}

export const KIND_LABELS: Record<SourceKind, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  smartrecruiters: 'SmartRecruiters',
  workable: 'Workable',
  workday: 'Workday',
  publicapi: 'API',
  rss: 'RSS',
  sitemap: 'Sitemap',
  firecrawl: 'Crawler',
  jobspy: 'Job boards',
};

export const INTERVAL_LABELS: Record<RefreshInterval, string> = {
  '1h': '1 h',
  '6h': '6 h',
  daily: 'Daily',
  weekly: 'Weekly',
};

export const INTERVAL_OPTIONS: { value: RefreshInterval; label: string }[] = [
  { value: '1h', label: 'Every hour' },
  { value: '6h', label: 'Every 6 h' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
];

/** Short pack names for the dense scope column. */
export function shortPackName(name: string): string {
  return name
    .replace(/^Top /, '')
    .replace(/ —.*$/, '')
    .replace(/ hiring interns$/, '')
    .replace(/ for engineering students$/, '')
    .replace(/ & mentorships$/, '');
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Display path under the name: host + path, no scheme ("boards.greenhouse.io/stripe"). */
export function displayUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname}`;
  } catch {
    return url;
  }
}

function toRow(
  s: SourceRow | CommunityRow,
  scope: 'personal' | 'pack',
  packName: string | null,
  mode: CreditMode | null,
): SourceTableRow {
  const input = { health: s.health, kind: s.kind, enabled: s.enabled, errorReason: s.errorReason, healthCode: s.healthCode };
  const status = displayHealth(input, mode);
  return {
    id: s.id,
    name: s.name,
    url: s.url,
    domain: s.companyDomain ?? null,
    kind: s.kind,
    scope,
    packId: s.packId ?? null,
    packName,
    typeTag: s.typeTag,
    refreshInterval: s.refreshInterval,
    lastCheckedAt: s.lastCheckedAt,
    listingsFound: s.listingsFound,
    status,
    health: s.health,
    healthCode: healthCodeOf(input, status),
    reason: healthReason(input, status),
    enabled: scope === 'pack' ? (s as CommunityRow).subscribed : s.enabled,
    editable: scope === 'personal',
    optimistic: Boolean((s as SourceRow).optimistic),
  };
}

export function buildRows(
  personal: readonly SourceRow[],
  community: readonly CommunityRow[],
  packs: readonly PackDTO[],
  mode: CreditMode | null,
): SourceTableRow[] {
  const packNames = new Map(packs.map((p) => [p.id, p.name]));
  const packOrder = new Map(packs.map((p, i) => [p.id, i]));
  const mine = personal.map((s) => toRow(s, 'personal', null, mode));
  const subscribed = community
    .filter((s) => s.subscribed)
    .sort(
      (a, b) =>
        (packOrder.get(a.packId ?? '') ?? 99) - (packOrder.get(b.packId ?? '') ?? 99) || a.name.localeCompare(b.name),
    )
    .map((s) => toRow(s, 'pack', s.packId ? (packNames.get(s.packId) ?? s.packId) : null, mode));
  return [...mine, ...subscribed];
}

export function matchesQuery(row: SourceTableRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    row.name.toLowerCase().includes(q) ||
    row.url.toLowerCase().includes(q) ||
    KIND_LABELS[row.kind].toLowerCase().includes(q) ||
    (row.packName ?? '').toLowerCase().includes(q)
  );
}

/** Per-pack aggregates for the Packs tab (logos cloud + listing counts). */
export function packSummaries(community: readonly CommunityRow[]) {
  const out = new Map<string, { listings: number; domains: string[]; failing: number }>();
  for (const s of community) {
    if (!s.packId) continue;
    const entry = out.get(s.packId) ?? { listings: 0, domains: [], failing: 0 };
    entry.listings += s.listingsFound;
    if (s.companyDomain && entry.domains.length < 8 && !entry.domains.includes(s.companyDomain)) {
      entry.domains.push(s.companyDomain);
    }
    if (s.health === 'failing') entry.failing += 1;
    out.set(s.packId, entry);
  }
  return out;
}
