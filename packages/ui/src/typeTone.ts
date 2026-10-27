import type { OpportunityTypeKey } from './types';

/**
 * Opportunity type → colour role (DESIGN §2.3). Static class strings so Tailwind can see them:
 * `tile` = icon tile / header strip (tint + tone text), `chip` = type chip, `dot` = 6 px marker,
 * `bar` = left light bar, `text` = tone text on a surface. Colour is always a tint plus a word or icon.
 */
export interface TypeTone {
  tile: string;
  chip: string;
  dot: string;
  bar: string;
  text: string;
  /** CSS variable holding the base colour (for SVG strokes and inline styles). */
  colorVar: string;
}

const tone = (key: string): TypeTone => ({
  tile: `bg-type-${key}-subtle text-type-${key}-fg`,
  chip: `bg-type-${key}-subtle`,
  dot: `bg-type-${key}`,
  bar: `bg-type-${key}`,
  text: `text-type-${key}-fg`,
  colorVar: `--color-type-${key}`,
});

export const TYPE_TONE: Record<OpportunityTypeKey, TypeTone> = {
  internship: {
    tile: 'bg-type-internship-subtle text-type-internship-fg',
    chip: 'bg-type-internship-subtle',
    dot: 'bg-type-internship',
    bar: 'bg-type-internship',
    text: 'text-type-internship-fg',
    colorVar: '--color-type-internship',
  },
  fulltime: {
    tile: 'bg-type-fulltime-subtle text-type-fulltime-fg',
    chip: 'bg-type-fulltime-subtle',
    dot: 'bg-type-fulltime',
    bar: 'bg-type-fulltime',
    text: 'text-type-fulltime-fg',
    colorVar: '--color-type-fulltime',
  },
  hackathon: {
    tile: 'bg-type-hackathon-subtle text-type-hackathon-fg',
    chip: 'bg-type-hackathon-subtle',
    dot: 'bg-type-hackathon',
    bar: 'bg-type-hackathon',
    text: 'text-type-hackathon-fg',
    colorVar: '--color-type-hackathon',
  },
  scholarship: {
    tile: 'bg-type-scholarship-subtle text-type-scholarship-fg',
    chip: 'bg-type-scholarship-subtle',
    dot: 'bg-type-scholarship',
    bar: 'bg-type-scholarship',
    text: 'text-type-scholarship-fg',
    colorVar: '--color-type-scholarship',
  },
  fellowship: {
    tile: 'bg-type-fellowship-subtle text-type-fellowship-fg',
    chip: 'bg-type-fellowship-subtle',
    dot: 'bg-type-fellowship',
    bar: 'bg-type-fellowship',
    text: 'text-type-fellowship-fg',
    colorVar: '--color-type-fellowship',
  },
  research: {
    tile: 'bg-type-research-subtle text-type-research-fg',
    chip: 'bg-type-research-subtle',
    dot: 'bg-type-research',
    bar: 'bg-type-research',
    text: 'text-type-research-fg',
    colorVar: '--color-type-research',
  },
  opensource: {
    tile: 'bg-type-opensource-subtle text-type-opensource-fg',
    chip: 'bg-type-opensource-subtle',
    dot: 'bg-type-opensource',
    bar: 'bg-type-opensource',
    text: 'text-type-opensource-fg',
    colorVar: '--color-type-opensource',
  },
};

export const typeTone = (type: OpportunityTypeKey): TypeTone => TYPE_TONE[type] ?? tone(type);
