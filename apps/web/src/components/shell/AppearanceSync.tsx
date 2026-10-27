import { useEffect, useRef } from 'react';

import { useMe } from '@/api/me';
import { useUpdateSettings } from '@/api/settings';
import { fromServerAppearance, toServerAppearance } from '@/lib/theme/appearance';
import { useTheme } from '@/lib/theme/context';

/**
 * Keeps Settings > Appearance in sync across devices while signed in:
 * - once per session, the server's appearance (from `/v1/me` settings summary) is applied locally;
 * - every user change afterwards is PATCHed to `/v1/settings` (debounced 400 ms).
 */
export function AppearanceSync() {
  const { data: me } = useMe();
  const { appearance, setAppearance, onUserChange } = useTheme();
  const update = useUpdateSettings();
  const applied = useRef(false);
  const mutate = useRef(update.mutate);
  useEffect(() => {
    mutate.current = update.mutate;
  });

  useEffect(() => {
    if (!me || applied.current) return;
    applied.current = true;
    const s = me.settings;
    setAppearance(
      fromServerAppearance(
        {
          theme: s.theme,
          accent: s.accent,
          density: s.density,
          fontSize: s.fontSize,
          reducedMotion: s.reducedMotion,
        },
        appearance,
      ),
      'server',
    );
  }, [me, appearance, setAppearance]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = onUserChange((next) => {
      clearTimeout(timer);
      timer = setTimeout(() => mutate.current({ appearance: toServerAppearance(next) }), 400);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [onUserChange]);

  return null;
}
