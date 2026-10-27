import { readFileSync } from 'node:fs';

import type { FetchContext, FetchSource } from '../fetchers/types.js';
import { nullLogger } from '../logger.js';

const SAMPLES = new URL('../../../../seed/samples/', import.meta.url);

/** Real endpoint responses recorded in seed/samples (see seed/VERIFICATION.md). */
export function sample<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(new URL(`${name}.json`, SAMPLES), 'utf8')) as T;
}

export const TEST_NOW = new Date('2026-10-27T06:30:00Z');

export function testSource(partial: Partial<FetchSource> & Pick<FetchSource, 'kind' | 'url'>): FetchSource {
  return {
    id: '64b000000000000000000001',
    name: 'Test Co',
    typeTag: null,
    ownerId: null,
    config: { boardToken: null, feedUrl: null, provider: null },
    etag: null,
    lastModified: null,
    ...partial,
  };
}

export function testCtx(partial: Partial<FetchContext> = {}): FetchContext {
  return { now: TEST_NOW, logger: nullLogger, detailDelayMs: 0, ...partial };
}
