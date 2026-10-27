import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';

import { usePrefersReducedMotion } from '@kestrel/ui';

import { useMediaQuery } from '../use-media-query';
import {
  applyAppearance,
  normaliseAppearance,
  readStoredAppearance,
  resolveTheme,
  sameAppearance,
  storeAppearance,
  type Appearance,
} from './appearance';
import { ThemeContext, type AppearanceChangeSource, type ThemeContextValue } from './context';

/**
 * Theme, accent, density, text size and motion preference.
 * - Persists to localStorage (`beacon:appearance`) so the index.html bootstrap paints the right theme.
 * - Follows `prefers-color-scheme` live while the theme is "system".
 * - Theme flips crossfade via a View Transition; Motion's `MotionConfig` lives in `<MotionProvider>`.
 * - Server sync is done by `<AppearanceSync>` (inside the signed-in shell) via `onUserChange`.
 */
export function ThemeProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial?: Partial<Appearance>;
}) {
  const [appearance, setState] = useState<Appearance>(() =>
    initial ? normaliseAppearance(initial) : readStoredAppearance(),
  );
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const resolvedTheme = resolveTheme(appearance.theme, systemDark);
  const reducedMotion = usePrefersReducedMotion();
  const [brandAccentCount, setBrandAccentCount] = useState(0);
  const listeners = useRef(new Set<(a: Appearance) => void>());
  const current = useRef(appearance);
  const reducedRef = useRef(reducedMotion);
  const brandRef = useRef(false);
  useEffect(() => {
    current.current = appearance;
    reducedRef.current = reducedMotion;
    brandRef.current = brandAccentCount > 0;
  });

  useEffect(() => {
    applyAppearance(appearance, resolvedTheme, { brandAccent: brandAccentCount > 0 });
  }, [appearance, resolvedTheme, brandAccentCount]);

  // Another tab changed the preference: follow it.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'beacon:appearance') setState(readStoredAppearance());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setAppearance = useCallback(
    (patch: Partial<Appearance>, source: AppearanceChangeSource = 'user') => {
      const prev = current.current;
      const next = normaliseAppearance({ ...prev, ...patch });
      if (sameAppearance(prev, next)) return;
      current.current = next;
      storeAppearance(next);
      const nextResolved = resolveTheme(next.theme);
      const themeFlips = resolveTheme(prev.theme) !== nextResolved;
      const doc = typeof document === 'undefined' ? null : document;
      // Theme changes crossfade the whole page with a View Transition (MOTION §5.14); everything else is instant.
      if (
        themeFlips &&
        source === 'user' &&
        doc &&
        'startViewTransition' in doc &&
        !reducedRef.current
      ) {
        doc.documentElement.setAttribute('data-vt', 'theme');
        const transition = doc.startViewTransition(() => {
          flushSync(() => setState(next));
          applyAppearance(next, nextResolved, { brandAccent: brandRef.current });
        });
        void transition.finished.finally(() => doc.documentElement.removeAttribute('data-vt'));
      } else {
        setState(next);
      }
      if (source === 'user') queueMicrotask(() => listeners.current.forEach((l) => l(next)));
    },
    [],
  );

  const toggleTheme = useCallback(() => {
    setAppearance({ theme: resolvedTheme === 'dark' ? 'light' : 'dark' });
  }, [resolvedTheme, setAppearance]);

  const onUserChange = useCallback((listener: (a: Appearance) => void) => {
    listeners.current.add(listener);
    return () => listeners.current.delete(listener);
  }, []);

  const setBrandAccent = useCallback((on: boolean) => {
    setBrandAccentCount((n) => Math.max(0, n + (on ? 1 : -1)));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      appearance,
      resolvedTheme,
      reducedMotion,
      setAppearance,
      toggleTheme,
      onUserChange,
      setBrandAccent,
    }),
    [
      appearance,
      resolvedTheme,
      reducedMotion,
      setAppearance,
      toggleTheme,
      onUserChange,
      setBrandAccent,
    ],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
