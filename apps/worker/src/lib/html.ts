import { decodeHTML } from 'entities';
import { NodeHtmlMarkdown } from 'node-html-markdown';

import { LIMITS } from '@kestrel/shared';

const nhm = new NodeHtmlMarkdown({ keepDataImages: false, useLinkReferenceDefinitions: false, maxConsecutiveNewlines: 2 });

/** Decodes HTML entities (Greenhouse `content` is entity-escaped HTML: `&lt;p&gt;`). */
export function decodeEntities(text: string): string {
  return decodeHTML(text);
}

/** HTML → Markdown, scripts/styles/images dropped, capped at the listing description limit. */
export function htmlToMarkdown(html: string | null | undefined): string {
  if (!html) return '';
  const cleaned = html
    .replace(/<(script|style|noscript|iframe)[\s\S]*?<\/\1>/gi, '')
    .replace(/<img[^>]*>/gi, '');
  const md = nhm.translate(cleaned).replace(/\n{3,}/g, '\n\n').trim();
  return md.slice(0, LIMITS.descriptionMax);
}

/** Entity-escaped HTML (Greenhouse) → Markdown. */
export function escapedHtmlToMarkdown(escaped: string | null | undefined): string {
  return escaped ? htmlToMarkdown(decodeEntities(escaped)) : '';
}

/** Strips tags for short plain strings (titles, prize amounts). */
export function stripTags(html: string | null | undefined): string {
  if (!html) return '';
  const text = html
    .replace(/<\/?(span|b|i|em|strong|a|u|small|sup|sub|font)\b[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(text).replace(/\s+/g, ' ').trim();
}

/** Plain text → Markdown-safe text (keeps paragraphs). */
export function plainToMarkdown(text: string | null | undefined): string {
  if (!text) return '';
  return text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, LIMITS.descriptionMax);
}
