/** Per-device view preferences for /sources (not synced: they are about this screen and window). */
import { useCallback, useState } from 'react';

import { readJson, writeJson } from '@/lib/storage';

const DETAILS_KEY = 'beacon:sources:details';

/** The simple list is the default; "Details" shows every column, sorting and the column menu. */
export function useDetailsView(): [boolean, (next: boolean) => void] {
  const [details, setState] = useState(() => readJson<boolean>(DETAILS_KEY, false) === true);
  const set = useCallback((next: boolean) => {
    setState(next);
    writeJson(DETAILS_KEY, next);
  }, []);
  return [details, set];
}
