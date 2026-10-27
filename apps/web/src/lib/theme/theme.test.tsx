import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { act, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyAppearance,
  DEFAULT_APPEARANCE,
  fromServerAppearance,
  normaliseAppearance,
  toServerAppearance,
  type Appearance,
} from './appearance';
import { useBrandAccent, useTheme, type ThemeContextValue } from './context';
import { ThemeProvider } from './ThemeProvider';

const root = document.documentElement;

function resetRoot() {
  root.className = '';
  for (const attr of ['data-theme', 'data-accent', 'data-density', 'data-font-size', 'data-motion'])
    root.removeAttribute(attr);
}

beforeEach(() => {
  localStorage.clear();
  resetRoot();
});
afterEach(resetRoot);

/** Runs the inline bootstrap script from index.html (the no-flash path) against the current storage. */
function runBootstrap(pathname = '/radar') {
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (!script) throw new Error('bootstrap script not found in index.html');
  window.history.replaceState(null, '', pathname);
  // The page's own inline script, run as-is (that is the point of the test).
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const bootstrap = new Function(script) as () => void;
  bootstrap();
}

describe('appearance model', () => {
  it('normalises junk and legacy values to safe defaults', () => {
    expect(normaliseAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(
      normaliseAppearance({
        theme: 'sepia',
        accent: 'rufous',
        density: 'tiny',
        fontSize: 'xl',
        motion: 'full',
      }),
    ).toEqual({
      theme: 'system',
      accent: 'amber',
      density: 'comfortable',
      fontSize: 'xl',
      motion: 'full',
    });
  });

  it('round-trips through the server shape (xl survives as a local refinement of lg)', () => {
    const local: Appearance = {
      theme: 'dark',
      accent: 'teal',
      density: 'compact',
      fontSize: 'xl',
      motion: 'reduced',
    };
    const server = toServerAppearance(local);
    expect(server).toEqual({
      theme: 'dark',
      accent: 'teal',
      density: 'compact',
      fontSize: 'lg',
      reducedMotion: 'reduce',
    });
    expect(fromServerAppearance(server, local)).toEqual(local);
    expect(
      fromServerAppearance(
        { accent: 'default', reducedMotion: 'no-preference' },
        DEFAULT_APPEARANCE,
      ),
    ).toMatchObject({
      accent: 'amber',
      motion: 'full',
    });
  });

  it('applies every attribute to <html> and drops data-accent for the brand preset', () => {
    applyAppearance(
      { theme: 'dark', accent: 'cobalt', density: 'compact', fontSize: 'lg', motion: 'reduced' },
      'dark',
    );
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.dataset).toMatchObject({
      theme: 'dark',
      accent: 'cobalt',
      density: 'compact',
      fontSize: 'lg',
      motion: 'reduced',
    });
    applyAppearance({ ...DEFAULT_APPEARANCE, accent: 'cobalt' }, 'light', { brandAccent: true });
    expect(root.classList.contains('dark')).toBe(false);
    expect(root.hasAttribute('data-accent')).toBe(false);
    expect(root.hasAttribute('data-motion')).toBe(false);
  });
});

describe('index.html bootstrap (no theme flash)', () => {
  it('paints the stored appearance before React loads', () => {
    localStorage.setItem(
      'beacon:appearance',
      JSON.stringify({
        theme: 'dark',
        accent: 'ink',
        density: 'compact',
        fontSize: 'sm',
        motion: 'reduced',
      }),
    );
    runBootstrap('/radar');
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.dataset).toMatchObject({
      theme: 'dark',
      accent: 'ink',
      density: 'compact',
      fontSize: 'sm',
      motion: 'reduced',
    });
  });

  it('keeps the brand accent on public pages and survives corrupt storage', () => {
    localStorage.setItem('beacon:appearance', JSON.stringify({ theme: 'light', accent: 'teal' }));
    runBootstrap('/');
    expect(root.hasAttribute('data-accent')).toBe(false);
    expect(root.dataset.theme).toBe('light');

    resetRoot();
    localStorage.setItem('beacon:appearance', '{not json');
    expect(() => runBootstrap('/radar')).not.toThrow();
    expect(root.dataset).toMatchObject({ theme: 'light', density: 'comfortable', fontSize: 'md' });
  });
});

describe('ThemeProvider', () => {
  function Probe({ onReady }: { onReady: (ctx: ThemeContextValue) => void }) {
    const ctx = useTheme();
    useEffect(() => {
      onReady(ctx);
    });
    return (
      <span data-testid="theme">{`${ctx.appearance.theme}/${ctx.resolvedTheme}/${ctx.appearance.accent}`}</span>
    );
  }

  it('starts from storage, applies changes to <html>, persists them and notifies user-change listeners only', () => {
    localStorage.setItem('beacon:appearance', JSON.stringify({ theme: 'light', accent: 'teal' }));
    let ctx: ThemeContextValue | undefined;
    render(
      <ThemeProvider>
        <Probe onReady={(c) => (ctx = c)} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme')).toHaveTextContent('light/light/teal');
    expect(root.dataset.accent).toBe('teal');

    const listener = vi.fn();
    act(() => void ctx?.onUserChange(listener));
    act(() => ctx?.setAppearance({ theme: 'dark', density: 'compact' }));
    expect(screen.getByTestId('theme')).toHaveTextContent('dark/dark/teal');
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.dataset.density).toBe('compact');
    expect(JSON.parse(localStorage.getItem('beacon:appearance') ?? '{}')).toMatchObject({
      theme: 'dark',
      density: 'compact',
    });

    return Promise.resolve().then(() => {
      expect(listener).toHaveBeenCalledTimes(1);
      act(() => ctx?.setAppearance({ accent: 'ink' }, 'server'));
      return Promise.resolve().then(() => {
        expect(listener).toHaveBeenCalledTimes(1);
        expect(root.dataset.accent).toBe('ink');
      });
    });
  });

  it('forces the brand accent while a public page is mounted', () => {
    localStorage.setItem('beacon:appearance', JSON.stringify({ accent: 'cobalt' }));
    function PublicPage() {
      useBrandAccent();
      return null;
    }
    const { rerender } = render(
      <ThemeProvider>
        <PublicPage />
      </ThemeProvider>,
    );
    expect(root.hasAttribute('data-accent')).toBe(false);
    rerender(
      <ThemeProvider>
        <span />
      </ThemeProvider>,
    );
    expect(root.dataset.accent).toBe('cobalt');
  });
});
