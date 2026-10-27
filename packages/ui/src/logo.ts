/** Reserved / fictional TLDs never resolve; skip the network and draw the letter avatar. */
const UNRESOLVABLE = /\.(example|test|invalid|localhost|local)$/i;

export function isResolvableDomain(domain: string | null | undefined): domain is string {
  return Boolean(domain && /\./.test(domain) && !UNRESOLVABLE.test(domain));
}

/** Stable small hash (letter-avatar tint). */
export function hashString(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}
