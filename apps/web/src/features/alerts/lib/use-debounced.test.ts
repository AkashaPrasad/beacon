import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDebouncedValue } from './use-debounced';

describe('useDebouncedValue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('settles after the delay and ignores equal objects', async () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 400), {
      initialProps: { value: { minFit: 80 } },
    });
    const first = result.current;
    rerender({ value: { minFit: 80 } });
    expect(result.current).toBe(first);
    rerender({ value: { minFit: 70 } });
    await act(() => vi.advanceTimersByTimeAsync(399));
    expect(result.current).toEqual({ minFit: 80 });
    rerender({ value: { minFit: 60 } });
    await act(() => vi.advanceTimersByTimeAsync(399));
    expect(result.current).toEqual({ minFit: 80 });
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(result.current).toEqual({ minFit: 60 });
  });
});
