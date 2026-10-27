import { createContext, useContext, useEffect } from 'react';

import { DEFAULT_APPEARANCE, type Appearance, type ResolvedTheme } from './appearance';

export type AppearanceChangeSource = 'user' | 'server';

export interface ThemeContextValue {
  appearance: Appearance;
  resolvedTheme: ResolvedTheme;
  /** True when motion should be reduced (OS or the user's Motion setting). */
  reducedMotion: boolean;
  /** Merge a patch. `source: 'server'` changes are applied without being synced back. */
  setAppearance: (patch: Partial<Appearance>, source?: AppearanceChangeSource) => void;
  toggleTheme: () => void;
  /** Subscribe to user-originated changes (used to PATCH /v1/settings). */
  onUserChange: (listener: (appearance: Appearance) => void) => () => void;
  /** Landing/OG surfaces always use the brand accent; call while mounted. */
  setBrandAccent: (on: boolean) => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  appearance: DEFAULT_APPEARANCE,
  resolvedTheme: 'light',
  reducedMotion: false,
  setAppearance: () => undefined,
  toggleTheme: () => undefined,
  onUserChange: () => () => undefined,
  setBrandAccent: () => undefined,
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/** Force the brand (signal amber) accent while the calling component is mounted (landing, sign-in). */
export function useBrandAccent(): void {
  const { setBrandAccent } = useContext(ThemeContext);
  useEffect(() => {
    setBrandAccent(true);
    return () => setBrandAccent(false);
  }, [setBrandAccent]);
}
