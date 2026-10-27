import { SourceError } from '../../lib/errors.js';
import { detectSourceKind, PUBLIC_API_HOSTS } from '../detect.js';
import type { FetchContext, FetchResult, Fetcher, FetchSource } from '../types.js';
import { str } from '../util.js';
import { fetchDevfolio, fetchDevpost, fetchHackerEarth, fetchKaggle, fetchUnstop } from './hackathons.js';
import { fetchAdzuna, fetchArbeitnow, fetchJobicy, fetchRemoteOk, fetchRemotive, fetchTheMuse } from './jobs.js';

type ProviderFetcher = (source: FetchSource, ctx: FetchContext, feedUrl: string) => Promise<FetchResult>;

export const PUBLIC_API_PROVIDERS: Readonly<Record<string, ProviderFetcher>> = {
  remotive: fetchRemotive,
  arbeitnow: fetchArbeitnow,
  remoteok: fetchRemoteOk,
  jobicy: fetchJobicy,
  themuse: fetchTheMuse,
  adzuna: fetchAdzuna,
  devpost: fetchDevpost,
  devfolio: fetchDevfolio,
  unstop: fetchUnstop,
  hackerearth: fetchHackerEarth,
  kaggle: fetchKaggle,
};

/** Resolves provider + feed URL from config (`provider`, `feedUrl`) or the source URL. */
export function resolvePublicApi(source: FetchSource): { provider: string; feedUrl: string } {
  const detected = detectSourceKind(str(source.config.feedUrl) ?? source.url);
  const provider = str(source.config.provider) ?? detected.provider;
  if (!provider || !PUBLIC_API_PROVIDERS[provider]) {
    throw new SourceError('parse', `Unknown public API provider for ${source.url}`);
  }
  const feedUrl =
    str(source.config.feedUrl) ??
    detected.feedUrl ??
    Object.values(PUBLIC_API_HOSTS).find((h) => h.provider === provider)?.feedUrl ??
    source.url;
  return { provider, feedUrl };
}

export const fetchPublicApi: Fetcher = async (source, ctx) => {
  const { provider, feedUrl } = resolvePublicApi(source);
  const fetcher = PUBLIC_API_PROVIDERS[provider];
  if (!fetcher) throw new SourceError('parse', `Unknown public API provider "${provider}"`);
  return fetcher(source, ctx, feedUrl);
};
