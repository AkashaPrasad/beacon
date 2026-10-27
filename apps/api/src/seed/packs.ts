/**
 * Source packs: loads `data/source-packs.json` (vendored copy of seed/source-packs.json) and
 * upserts the community sources on boot. Existing documents are never overwritten, so the
 * worker's health/lastCheckedAt fields survive restarts; only pack membership is added.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  OPPORTUNITY_TYPES,
  SOURCE_KINDS,
  SOURCE_PACK_LABELS,
  tryNormaliseUrl,
  type OpportunityType,
  type RefreshInterval,
  type SourceKind,
} from '@kestrel/shared';

import type { Logger } from '../logger.js';
import { Source, type SourceConfigDoc } from '../models/source.js';

export interface SeedSource {
  name: string;
  url: string;
  kind: string;
  boardToken?: string;
  apiUrl?: string;
  companyDomain?: string;
  types?: string[];
  country?: string;
  tags?: string[];
  tenant?: string;
  wdHost?: string;
  site?: string;
  apiMethod?: string;
  method?: string;
  apiBody?: unknown;
  body?: unknown;
  headers?: Record<string, string>;
}

interface SeedPack {
  id: string;
  name: string;
  optional?: boolean;
  sources: SeedSource[];
}

interface SeedFile {
  generatedAt: string;
  packs: SeedPack[];
}

/** Seed-file pack ids → canonical pack ids (shared SOURCE_PACK_IDS + `opensource-programs`). */
export const PACK_ALIASES: Readonly<Record<string, string>> = {
  'india-product': 'top-indian-product',
  'faang-india': 'faang-plus-india',
  'yc-startups': 'yc-startups-interns',
  hackathons: 'hackathons-india',
  scholarships: 'scholarships-engineering',
  'remote-friendly': 'remote-friendly-startups',
  'opensource-programs': 'opensource-programs',
};

export interface PackInfo {
  id: string;
  name: string;
  optional: boolean;
  sources: SeedSource[];
  kinds: Partial<Record<SourceKind, number>>;
}

const here = dirname(fileURLToPath(import.meta.url));
let cache: PackInfo[] | null = null;

export function packFilePath(): string {
  return resolve(here, 'data/source-packs.json');
}

export function loadPacks(): PackInfo[] {
  if (cache) return cache;
  const file = JSON.parse(readFileSync(packFilePath(), 'utf8')) as SeedFile;
  cache = file.packs.map((pack) => {
    const id = PACK_ALIASES[pack.id] ?? pack.id;
    const kinds: Partial<Record<SourceKind, number>> = {};
    for (const s of pack.sources) {
      const kind = toKind(s.kind);
      kinds[kind] = (kinds[kind] ?? 0) + 1;
    }
    const label = (SOURCE_PACK_LABELS as Record<string, string | undefined>)[id];
    return { id, name: label ?? pack.name, optional: pack.optional ?? false, sources: pack.sources, kinds };
  });
  return cache;
}

/** Accepts canonical ids and seed-file aliases. */
export function resolvePackId(input: string): string | null {
  const id = PACK_ALIASES[input] ?? input;
  return loadPacks().some((p) => p.id === id) ? id : null;
}

export function getPack(id: string): PackInfo | undefined {
  return loadPacks().find((p) => p.id === id);
}

function toKind(kind: string): SourceKind {
  return (SOURCE_KINDS as readonly string[]).includes(kind) ? (kind as SourceKind) : 'firecrawl';
}

export function seedKeyFor(source: Pick<SeedSource, 'url'>): string {
  return tryNormaliseUrl(source.url) ?? source.url.trim().toLowerCase();
}

function refreshFor(kind: SourceKind): RefreshInterval {
  if (kind === 'firecrawl') return 'weekly';
  return 'daily';
}

function providerOf(source: SeedSource): string | null {
  if (source.kind !== 'publicapi' || !source.apiUrl) return null;
  try {
    const host = new URL(source.apiUrl).hostname.replace(/^(www|api)\./, '');
    return host.split('.')[0] ?? null;
  } catch {
    return null;
  }
}

export function toSourceDocument(source: SeedSource, packId: string) {
  const kind = toKind(source.kind);
  const types = (source.types ?? []).filter((t): t is OpportunityType =>
    (OPPORTUNITY_TYPES as readonly string[]).includes(t),
  );
  const method = (source.apiMethod ?? source.method)?.toUpperCase();
  const config: SourceConfigDoc = {
    boardToken: source.boardToken ?? null,
    feedUrl: source.apiUrl ?? null,
    provider: providerOf(source),
    apiUrl: source.apiUrl ?? null,
    method: method === 'POST' ? 'POST' : method === 'GET' ? 'GET' : null,
    body: source.apiBody ?? source.body ?? null,
    headers: source.headers ?? null,
    tenant: source.tenant ?? null,
    site: source.site ?? null,
    wdHost: source.wdHost ?? null,
  };
  return {
    url: tryNormaliseUrl(source.url) ?? source.url,
    name: source.name.slice(0, 160),
    kind,
    scope: 'community' as const,
    ownerId: null,
    packId,
    typeTag: types.length === 1 ? types[0]! : null,
    enabled: true,
    refreshInterval: refreshFor(kind),
    health: 'pending' as const,
    config,
    companyDomain: source.companyDomain ?? null,
    country: source.country && /^[A-Z]{2}$/.test(source.country) ? source.country : null,
    tags: source.tags ?? [],
    seedKey: seedKeyFor(source),
  };
}

/** Upsert every community source from the packs (insert-only + pack membership). */
export async function seedCommunitySources(logger?: Logger): Promise<{ total: number; inserted: number }> {
  const ops = loadPacks().flatMap((pack) =>
    pack.sources.map((source) => {
      const { seedKey, ...doc } = toSourceDocument(source, pack.id);
      const { packId: _packId, ...insertOnly } = doc;
      return {
        updateOne: {
          filter: { seedKey },
          update: {
            $setOnInsert: { ...insertOnly, seedKey, packId: pack.id, listingsFound: 0, lastCheckedAt: null },
            $addToSet: { packIds: pack.id },
          },
          upsert: true,
          setDefaultsOnInsert: false,
        },
      };
    }),
  );
  if (ops.length === 0) return { total: 0, inserted: 0 };
  const result = await Source.bulkWrite(ops, { ordered: false });
  const inserted = result.upsertedCount;
  logger?.info({ total: ops.length, inserted }, 'community sources seeded');
  return { total: ops.length, inserted };
}
