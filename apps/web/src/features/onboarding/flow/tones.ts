/**
 * Colour tones for icon tiles on option cards (types, roles, interests), profile skill categories and
 * notification kinds. One map, so the palette tokens (docs/DESIGN.md §2) are wired in one place.
 */
export const TONES = [
  'cobalt',
  'violet',
  'teal',
  'orange',
  'pink',
  'lime',
  'amber',
  'indigo',
] as const;
export type Tone = (typeof TONES)[number];

/** Tile: soft tinted fill + readable tone foreground. */
export const TONE_TILE: Record<Tone, string> = {
  cobalt: 'bg-accent-subtle text-accent-strong',
  violet: 'bg-accent-subtle text-accent-strong',
  teal: 'bg-accent-subtle text-accent-strong',
  orange: 'bg-accent-subtle text-accent-strong',
  pink: 'bg-accent-subtle text-accent-strong',
  lime: 'bg-accent-subtle text-accent-strong',
  amber: 'bg-accent-subtle text-accent-strong',
  indigo: 'bg-accent-subtle text-accent-strong',
};

/** A stable tone for any key (skill categories, role groups). */
export function toneFor(key: string): Tone {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length]!;
}
