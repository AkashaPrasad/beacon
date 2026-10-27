/**
 * The rule the editor just created, so the list can play its enter animation once after navigating
 * back (MOTION §5.5 live insert). Keyed by the list key (`alertListKey`). Reading is idempotent for
 * a few seconds (StrictMode runs state initialisers twice), then the mark expires.
 */
const TTL_MS = 3_000;
let mark: { key: string; at: number } | null = null;

export function markJustSaved(key: string): void {
  mark = { key, at: Date.now() };
}

export function readJustSaved(now = Date.now()): string | null {
  if (!mark || now - mark.at > TTL_MS) {
    mark = null;
    return null;
  }
  return mark.key;
}
