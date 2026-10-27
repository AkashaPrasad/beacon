/** Settings > Appearance choices (DESIGN §10.6) over the ThemeProvider model (src/lib/theme). */
import type { Accent, Density, FontSize, MotionPref, ThemePref } from '@/lib/theme/appearance';

export const THEME_CHOICES: readonly { value: ThemePref; label: string; hint: string }[] = [
  { value: 'light', label: 'Light', hint: 'Paper and charcoal' },
  { value: 'dark', label: 'Dark', hint: 'One warm lamp' },
  { value: 'system', label: 'System', hint: 'Matches your device' },
];

export const ACCENT_CHOICES: readonly { value: Accent; label: string }[] = [
  { value: 'amber', label: 'Evergreen' },
  { value: 'teal', label: 'Teal' },
  { value: 'cobalt', label: 'Forest' },
  { value: 'ink', label: 'Ink' },
];

/**
 * Swatch colours per preset and theme. They mirror `--color-accent` in packages/ui/tokens.css §4; a
 * swatch must show its own preset whatever accent the page currently uses, so it can't read the token.
 */
export const ACCENT_SWATCH: Record<Accent, { light: string; dark: string }> = {
  amber: { light: '#1e6b4f', dark: '#8fc5aa' },
  teal: { light: '#326b69', dark: '#8fc5aa' },
  cobalt: { light: '#1e6b4f', dark: '#8fc5aa' },
  ink: { light: '#2a2622', dark: '#e6e2dc' },
};

export const DENSITY_CHOICES: readonly { value: Density; label: string }[] = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
];

export const FONT_SIZE_CHOICES: readonly { value: FontSize; label: string; ariaLabel: string }[] = [
  { value: 'sm', label: 'S', ariaLabel: 'Small text' },
  { value: 'md', label: 'M', ariaLabel: 'Medium text' },
  { value: 'lg', label: 'L', ariaLabel: 'Large text' },
  { value: 'xl', label: 'XL', ariaLabel: 'Extra large text' },
];

export const MOTION_CHOICES: readonly { value: MotionPref; label: string; hint: string }[] = [
  { value: 'system', label: 'System', hint: 'Follows your device’s reduce-motion setting.' },
  { value: 'reduced', label: 'Reduced', hint: 'Crossfades only; nothing slides or scales.' },
  {
    value: 'full',
    label: 'Full',
    hint: 'Springs and transitions even if your device asks for less.',
  },
];
