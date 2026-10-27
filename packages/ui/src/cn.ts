import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * The type scale in tokens.css names its sizes (`text-body`, `text-caption`, …). tailwind-merge
 * cannot tell those from colour utilities, so without this config `cn('text-accent-fg', 'text-body')`
 * dropped the colour and painted primary buttons ink-on-ink. Register every named size here.
 */
const FONT_SIZES = [
  'display-xl',
  'display',
  'h1',
  'h2',
  'h3',
  'body-lg',
  'body',
  'label',
  'small',
  'caption',
  'mono-lg',
  'mono',
  'mono-sm',
];

const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: FONT_SIZES }] } },
});

/** Compose class names and resolve conflicting Tailwind utilities (last one wins). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
