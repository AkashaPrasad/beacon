import { afterEach, describe, expect, it, vi } from 'vitest';

import { undoLast, withUndo } from './undo';

const toastMock = vi.hoisted(() => {
  const fn = vi.fn(
    (_message: string, _options?: { action?: { onClick: () => void } }) => 'toast-1',
  ) as ReturnType<typeof vi.fn> & {
    dismiss: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  fn.dismiss = vi.fn();
  fn.error = vi.fn();
  return fn;
});
vi.mock('sonner', () => ({ toast: toastMock }));

afterEach(() => {
  toastMock.mockClear();
  toastMock.dismiss.mockClear();
  toastMock.error.mockClear();
});

describe('withUndo', () => {
  it('runs the action, shows a 6 s undo toast, and undoes from the toast action or `u` / ⌘Z', async () => {
    const run = vi.fn(() => Promise.resolve('server-result'));
    const undo = vi.fn();
    const { promise } = withUndo({ message: 'Hidden “Platform Engineering Intern”.', run, undo });
    await promise;
    expect(run).toHaveBeenCalledTimes(1);
    const [message, options] = toastMock.mock.calls[0] ?? [];
    expect(message).toBe('Hidden “Platform Engineering Intern”.');
    expect(options).toMatchObject({ duration: 6000, action: { label: 'Undo' } });

    expect(undoLast()).toBe(true);
    await vi.waitFor(() => expect(undo).toHaveBeenCalledWith('server-result'));
    expect(toastMock.dismiss).toHaveBeenCalledWith('toast-1');
    // Only once: a second press has nothing left to undo.
    expect(undoLast()).toBe(false);
  });

  it('waits for an in-flight save before sending Undo', async () => {
    let finish!: (value: string) => void;
    const saved = new Promise<string>((resolve) => {
      finish = resolve;
    });
    const undo = vi.fn();
    const { promise } = withUndo({ message: 'Name updated.', run: () => saved, undo });
    expect(undoLast()).toBe(true);
    await Promise.resolve();
    expect(undo).not.toHaveBeenCalled();
    finish('saved-name');
    await promise;
    await vi.waitFor(() => expect(undo).toHaveBeenCalledWith('saved-name'));
  });

  it('replaces the toast with an error + Retry when the action fails', async () => {
    const { promise } = withUndo({
      message: 'Saved.',
      run: () => Promise.reject(new Error('Offline')),
      undo: vi.fn(),
    });
    await expect(promise).rejects.toThrow('Offline');
    expect(toastMock.error).toHaveBeenCalledWith(
      'Offline',
      expect.objectContaining({
        duration: 8000,
        action: expect.objectContaining({ label: 'Retry' }),
      }),
    );
    expect(undoLast()).toBe(false);
  });
});
