/** URLs the user just added: their rows play the live-insert enter once (MOTION §5.5). */
const justAdded = new Set<string>();

export function markSourceJustAdded(url: string): void {
  justAdded.add(url);
}

export function isSourceJustAdded(url: string): boolean {
  return justAdded.has(url);
}

export function clearSourceJustAdded(url: string): void {
  justAdded.delete(url);
}
