// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { fitAccessibleLabel, fitBandOf } from './fit';
import { resetFitRingSession } from './fit-session';
import { FitRing } from './FitRing';

beforeAll(() => {
  // Reduced motion: the ring renders filled, so the final state is asserted without timers.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});
afterEach(() => {
  cleanup();
  resetFitRingSession();
});

describe('fit bands', () => {
  it('maps scores to the four named bands, clamping out-of-range values', () => {
    expect(fitBandOf(86).label).toBe('Strong fit');
    expect(fitBandOf(60).label).toBe('Good fit');
    expect(fitBandOf(59.4).label).toBe('Worth a look');
    expect(fitBandOf(-5).label).toBe('Long shot');
    expect(fitAccessibleLabel(Number.NaN)).toBe('Fit 0 of 100, long shot');
    expect(fitAccessibleLabel(140)).toBe('Fit 100 of 100, strong fit');
  });
});

describe('<FitRing>', () => {
  it('is one image with the score and band in its accessible name; the SVG and digits are hidden', () => {
    const { container } = render(<FitRing score={86} size={40} />);
    const ring = screen.getByRole('img', { name: 'Fit 86 of 100, strong fit' });
    expect(ring).toHaveAttribute('data-band', 'great');
    expect(ring).toHaveAttribute('data-score', '86');
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    // Nothing inside the ring is announced separately or reachable by Tab.
    expect(screen.queryAllByRole('img')).toHaveLength(1);
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(0);
  });

  it('shows the band name as text next to the number (colour is never the only signal)', () => {
    render(<FitRing score={64} label="right" />);
    expect(screen.getByText('64 · Good fit')).toBeInTheDocument();
    cleanup();
    render(<FitRing score={35} label="below" />);
    expect(screen.getByText('Long shot')).toBeInTheDocument();
  });

  it('marks a pending AI re-rank with a dotted track, never a spinner', () => {
    const { container } = render(<FitRing score={72} pending />);
    const [track] = container.querySelectorAll('circle');
    expect(track?.getAttribute('stroke-dasharray')).toMatch(/^1 /);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByRole('img')).toHaveAccessibleName('Fit 72 of 100, good fit');
  });
});

describe('<FitRing> under StrictMode', () => {
  it('still shows its value after the dev double-mount (the one-time fill is not lost)', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const { StrictMode } = await import('react');
    render(
      <StrictMode>
        <FitRing score={86} animateId="listing-strict" />
      </StrictMode>,
    );
    const ring = screen.getByRole('img', { name: 'Fit 86 of 100, strong fit' });
    expect(ring).toHaveAttribute('data-score', '86');
  });
});
