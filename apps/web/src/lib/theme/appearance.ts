import type { AppearanceSettings } from '@kestrel/shared';

import { readJson, STORAGE_KEYS, writeJson } from '../storage';

/**
 * Local appearance model (`localStorage['beacon:appearance']`, read by the inline bootstrap script in
 * index.html before first paint). Mirrors Settings > Appearance (DESIGN §10.6).
 */
export const THEMES = ['light', 'dark', 'system'] as const;
export const ACCENTS = ['amber', 'teal', 'cobalt', 'ink'] as const;
export const DENSITIES = ['comfortable', 'compact'] as const;
export const FONT_SIZES = ['sm', 'md', 'lg', 'xl'] as const;
export const MOTION_PREFS = ['system', 'reduced', 'full'] as const;

export type ThemePref = (typeof THEMES)[number];
export type Accent = (typeof ACCENTS)[number];
export type Density = (typeof DENSITIES)[number];
export type FontSize = (typeof FONT_SIZES)[number];
export type MotionPref = (typeof MOTION_PREFS)[number];
export type ResolvedTheme = 'light' | 'dark';

export interface Appearance {
  theme: ThemePref;
  accent: Accent;
  density: Density;
  fontSize: FontSize;
  motion: MotionPref;
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'system',
  accent: 'amber',
  density: 'comfortable',
  fontSize: 'md',
  motion: 'system',
};

export const ACCENT_LABELS: Record<Accent, string> = { amber: 'Signal amber', teal: 'Teal', cobalt: 'Cobalt', ink: 'Ink' };

const pick = <T extends string>(values: readonly T[], value: unknown, fallback: T): T =>
  values.includes(value as T) ? (value as T) : fallback;

export function normaliseAppearance(input: Partial<Record<keyof Appearance, unknown>> | null | undefined): Appearance {
  const a = input ?? {};
  // `rufous` was the pre-launch name of the brand preset.
  const accent = a.accent === 'rufous' || a.accent === 'default' ? 'amber' : a.accent;
  return {
    theme: pick(THEMES, a.theme, DEFAULT_APPEARANCE.theme),
    accent: pick(ACCENTS, accent, DEFAULT_APPEARANCE.accent),
    density: pick(DENSITIES, a.density, DEFAULT_APPEARANCE.density),
    fontSize: pick(FONT_SIZES, a.fontSize, DEFAULT_APPEARANCE.fontSize),
    motion: pick(MOTION_PREFS, a.motion, DEFAULT_APPEARANCE.motion),
  };
}

export function readStoredAppearance(): Appearance {
  return normaliseAppearance(readJson<Partial<Appearance> | null>(STORAGE_KEYS.appearance, null));
}

export function storeAppearance(appearance: Appearance): void {
  writeJson(STORAGE_KEYS.appearance, appearance);
}

export function systemPrefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveTheme(pref: ThemePref, systemDark = systemPrefersDark()): ResolvedTheme {
  return pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;
}

const THEME_COLOR: Record<ResolvedTheme, string> = { light: '#F7F6F3', dark: '#131110' };

/** Apply to <html> exactly like the bootstrap script does (so both stay in sync). */
export function applyAppearance(
  appearance: Appearance,
  resolved: ResolvedTheme,
  options: { brandAccent?: boolean } = {},
): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.setAttribute('data-theme', resolved);
  if (appearance.accent === 'amber' || options.brandAccent) root.removeAttribute('data-accent');
  else root.setAttribute('data-accent', appearance.accent);
  root.setAttribute('data-density', appearance.density);
  root.setAttribute('data-font-size', appearance.fontSize);
  if (appearance.motion === 'system') root.removeAttribute('data-motion');
  else root.setAttribute('data-motion', appearance.motion);
  root.removeAttribute('data-boot');
  // Browser chrome follows an explicit theme too (the static metas only cover "system").
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.content = THEME_COLOR[resolved];
  });
}

// ── Server mapping (shared `AppearanceSettings`: fontSize has no xl, reducedMotion uses other words) ──

export function toServerAppearance(a: Appearance): AppearanceSettings {
  return {
    theme: a.theme,
    accent: a.accent === 'amber' ? 'default' : a.accent,
    density: a.density,
    fontSize: a.fontSize === 'xl' ? 'lg' : a.fontSize,
    reducedMotion: a.motion === 'reduced' ? 'reduce' : a.motion === 'full' ? 'no-preference' : 'system',
  };
}

export function fromServerAppearance(server: Partial<AppearanceSettings>, local: Appearance): Appearance {
  const fontSize: FontSize =
    // The server can't store xl yet; keep a local xl when the server says lg.
    server.fontSize === 'lg' && local.fontSize === 'xl' ? 'xl' : pick(FONT_SIZES, server.fontSize, local.fontSize);
  return normaliseAppearance({
    theme: server.theme ?? local.theme,
    accent: server.accent === undefined ? local.accent : server.accent,
    density: server.density ?? local.density,
    fontSize,
    motion:
      server.reducedMotion === 'reduce'
        ? 'reduced'
        : server.reducedMotion === 'no-preference'
          ? 'full'
          : server.reducedMotion === 'system'
            ? 'system'
            : local.motion,
  });
}

export function sameAppearance(a: Appearance, b: Appearance): boolean {
  return (
    a.theme === b.theme &&
    a.accent === b.accent &&
    a.density === b.density &&
    a.fontSize === b.fontSize &&
    a.motion === b.motion
  );
}
