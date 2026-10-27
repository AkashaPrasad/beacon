import Parser from 'rss-parser';

import { buildAll, type RawListing } from './build.js';
import { emptyResult, type Fetcher } from './types.js';
import { companyOf, str } from './util.js';
import { SourceError } from '../lib/errors.js';
import { htmlToMarkdown, plainToMarkdown, stripTags } from '../lib/html.js';
import { httpRequest } from '../lib/http.js';


type FeedItem = Parser.Item & { 'content:encoded'?: string; id?: string };

const parser: Parser<Record<string, unknown>, FeedItem> = new Parser({ customFields: { item: ['content:encoded', 'id'] } });

/** "Company: Role" titles used by job feeds such as We Work Remotely. */
const COMPANY_PREFIX = /^([^:|]{2,80}):\s+(.{3,})$/;

/** RSS/Atom via rss-parser, with conditional GET. Feed items are unstructured: LLM extraction. */
export const fetchRss: Fetcher = async (source, ctx) => {
  const feedUrl = str(source.config.feedUrl) ?? source.url;
  const res = await httpRequest(feedUrl, {
    etag: source.etag,
    lastModified: source.lastModified,
    headers: { accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5' },
    maxBytes: 10 * 1024 * 1024,
  });
  if (res.notModified) return emptyResult({ notModified: true, etag: source.etag ?? null, lastModified: source.lastModified ?? null });
  let feed: Parser.Output<FeedItem>;
  try {
    feed = await parser.parseString(res.text);
  } catch (err) {
    throw new SourceError('parse', `Not a valid RSS/Atom feed: ${err instanceof Error ? err.message : String(err)}`, { url: feedUrl });
  }
  const isJobFeed = /weworkremotely\.com/.test(feedUrl) || source.config.feedType === 'jobs';
  const fallbackCompany = companyOf(source, feed.title ?? null);
  const raws = (feed.items ?? []).map((item): RawListing => {
    let title = stripTags(item.title);
    let company = fallbackCompany;
    const m = isJobFeed ? COMPANY_PREFIX.exec(title) : null;
    if (m?.[1] && m[2]) {
      company = m[1].trim();
      title = m[2].trim();
    }
    const html = item['content:encoded'] ?? item.content ?? '';
    return {
      externalId: item.guid ?? item.id ?? item.link ?? title,
      title,
      company,
      applyUrl: item.link,
      descriptionMd: html ? htmlToMarkdown(html) : plainToMarkdown(item.contentSnippet ?? item.summary),
      postedAt: item.isoDate ?? item.pubDate ?? null,
      typeHints: item.categories ?? [],
      structured: false,
    };
  });
  const { listings, warnings } = buildAll(raws, source, ctx.now, ctx.maxItems);
  return emptyResult({ listings, warnings, etag: res.etag, lastModified: res.lastModified, totalReported: raws.length });
};
