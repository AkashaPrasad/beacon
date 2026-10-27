/**
 * Per-page <head> tags on the client (title comes from the route `handle`; prerender writes the static
 * copies at build time). Keeps canonical, description and Open Graph in step on client navigations.
 */
import { useEffect } from 'react';

import { env } from '@/lib/env';

import { documentTitle, type PublicPage } from '../content/pages';

function setMeta(selector: string, attr: string, value: string) {
  const el = document.head.querySelector<HTMLMetaElement | HTMLLinkElement>(selector);
  if (el) el.setAttribute(attr, value);
}

export function Seo({ page }: { page: PublicPage }) {
  useEffect(() => {
    const origin = (env.webUrl ?? window.location.origin).replace(/\/+$/, '');
    const url = `${origin}${page.path === '/' ? '/' : page.path}`;
    document.title = documentTitle(page);
    setMeta('meta[name="description"]', 'content', page.description);
    setMeta('link[rel="canonical"]', 'href', url);
    setMeta('meta[property="og:url"]', 'content', url);
    setMeta('meta[property="og:title"]', 'content', documentTitle(page));
    setMeta('meta[property="og:description"]', 'content', page.description);
    setMeta('meta[name="twitter:title"]', 'content', documentTitle(page));
    setMeta('meta[name="twitter:description"]', 'content', page.description);
  }, [page]);
  return null;
}
