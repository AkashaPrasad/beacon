import { afterEach, describe, expect, it, vi } from 'vitest';

import { deferCommit, flushPendingCommits, hasPendingCommit } from './deferred';

afterEach(() => {
  vi.useRealTimers();
});

describe('deferCommit', () => {
  it('commits after the undo window', async () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    deferCommit('a', commit, 1000);
    expect(hasPendingCommit('a')).toBe(true);
    await vi.advanceTimersByTimeAsync(999);
    expect(commit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(hasPendingCommit('a')).toBe(false);
  });

  it('cancel prevents the commit; a second cancel reports false', async () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    const h = deferCommit('b', commit, 1000);
    expect(h.cancel()).toBe(true);
    expect(h.cancel()).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(commit).not.toHaveBeenCalled();
  });

  it('flushes everything on pagehide', async () => {
    vi.useFakeTimers();
    const one = vi.fn();
    const two = vi.fn();
    deferCommit('c', one, 5000);
    deferCommit('d', two, 5000);
    flushPendingCommits();
    await Promise.resolve();
    await Promise.resolve();
    expect(one).toHaveBeenCalled();
    expect(two).toHaveBeenCalled();
  });
});
