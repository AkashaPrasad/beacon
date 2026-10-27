import { useEffect, useState } from 'react';

/**
 * The value after it has stopped changing for `ms`. Compared by JSON, so a new object with the same
 * content (a re-derived draft) doesn't restart the timer.
 */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const key = JSON.stringify(value);
  const [settled, setSettled] = useState<{ key: string; value: T }>({ key, value });
  useEffect(() => {
    if (key === settled.key) return undefined;
    const timer = setTimeout(() => setSettled({ key, value }), ms);
    return () => clearTimeout(timer);
  }, [key, ms, settled.key, value]);
  return settled.value;
}
