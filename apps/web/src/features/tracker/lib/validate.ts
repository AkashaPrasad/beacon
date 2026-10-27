/** Small field validators for the detail panel (contacts, documents, manual add). */

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Accepts "acme.dev/careers" by adding https:// (returns null when it still isn't a URL). */
export function normaliseHttpUrl(value: string): string | null {
  const t = value.trim();
  if (!t) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
  return isHttpUrl(withScheme) ? withScheme : null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isEmail(value: string): boolean {
  return EMAIL.test(value.trim());
}
