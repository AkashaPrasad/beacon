import type { DetectResult } from '@/api/types';
import { SOURCE_KIND_LABELS, type SourceKind } from '@kestrel/shared';


/** Accepts "careers.acme.dev" or a full URL; returns an https URL, or null when it can't be one. */
export function toDetectableUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (!/^https?:$/.test(url.protocol)) return null;
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function kindLabel(kind: SourceKind): string {
  const label = SOURCE_KIND_LABELS[kind] ?? kind;
  if (kind === 'rss') return 'RSS feed';
  if (kind === 'sitemap') return 'Sitemap';
  if (kind === 'publicapi') return `${label}`;
  return `${label} board`;
}

/** Detection outcome → the line to show (USERFLOW §1.6 copy). */
export function describeDetection(result: DetectResult): {
  tone: 'success' | 'crawl' | 'failure';
  text: string;
  action: string | null;
} {
  if (!result.valid) {
    return {
      tone: 'failure',
      text: "We couldn't find listings on that page. Try the company's careers page, or a Greenhouse, Lever or Ashby link.",
      action: null,
    };
  }
  if (result.kind === 'firecrawl') {
    return {
      tone: 'crawl',
      text: "No job board API here. We'll read the page instead (uses crawl credits).",
      action: 'Add anyway',
    };
  }
  const token = result.boardToken ?? result.companyName ?? result.name ?? '';
  const count = result.previewCount;
  return {
    tone: 'success',
    text: `Detected: ${kindLabel(result.kind)}${token ? ` ${token}` : ''}${count != null ? ` → ${count.toLocaleString('en-IN')} ${count === 1 ? 'job' : 'jobs'}` : ''}`,
    action: 'Add',
  };
}
