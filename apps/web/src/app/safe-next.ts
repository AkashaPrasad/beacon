/** Same-origin relative path only (no protocol-relative or absolute URLs, no auth pages). */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\'))
    return null;
  if (next.startsWith('/login') || next.startsWith('/auth/')) return null;
  return next;
}
