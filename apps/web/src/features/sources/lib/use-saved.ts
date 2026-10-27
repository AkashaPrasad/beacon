import { useCallback, useEffect, useRef, useState } from 'react';

/** Inline "Saved" caption for 1.5 s after a save (DESIGN §6.1: save on change, no Save buttons). */
export function useSavedFlash(ms = 1500): [visible: boolean, flash: () => void] {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const flash = useCallback(() => {
    setVisible(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), ms);
  }, [ms]);
  return [visible, flash];
}
