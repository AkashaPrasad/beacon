import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { domAnimation, LazyMotion } from 'motion/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { DetectPanel } from './DetectPanel';
import { classifyResult, type DetectResult, type DetectState } from '../lib/detect-machine';

function result(patch: Partial<DetectResult> = {}): DetectResult {
  return {
    url: 'https://boards.greenhouse.io/stripe',
    kind: 'greenhouse',
    confidence: 1,
    boardToken: 'stripe',
    company: 'Stripe',
    name: 'Stripe',
    previewCount: 142,
    sampleTitles: ['Software Engineer, Intern', 'Backend Engineer', 'Data Analyst', 'Designer'],
    costsCredits: false,
    message: '',
    valid: true,
    apiUrl: null,
    companyName: 'Stripe',
    companyDomain: 'stripe.com',
    finalUrl: null,
    config: { boardToken: 'stripe', feedUrl: null, provider: null },
    ...patch,
  };
}

const ui = (el: ReactElement) => render(<LazyMotion features={domAnimation}>{el}</LazyMotion>);

function panel(state: DetectState, extra: Partial<Parameters<typeof DetectPanel>[0]> = {}) {
  return ui(
    <DetectPanel
      state={state}
      creditsPerDay={4}
      creditsPaused={false}
      onRetry={() => undefined}
      {...extra}
    />,
  );
}

describe('DetectPanel', () => {
  it('detected: copy #9 with the board token, count and 3 preview rows', () => {
    panel(classifyResult('stripe', 'https://boards.greenhouse.io/stripe', result()));
    const line = screen.getByTestId('source-detect-result');
    expect(line).toHaveTextContent(/Detected:\s+Greenhouse board stripe → 142 jobs/);
    expect(within(screen.getByRole('list', { name: 'Preview' })).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByTestId('sources-detect-result')).toHaveAttribute('data-status', 'detected');
  });

  it('redirect: names the page Beacon will watch', () => {
    panel(
      classifyResult('acme.dev/jobs', 'https://acme.dev/jobs', result({ finalUrl: 'https://boards.greenhouse.io/acmedev' })),
    );
    expect(screen.getByText(/Redirects to/)).toHaveTextContent('Redirects to boards.greenhouse.io/acmedev');
  });

  it('crawler fallback: credit estimate, and the paused note when the budget is gone', () => {
    const state = classifyResult(
      'acme.dev/careers',
      'https://acme.dev/careers',
      result({ kind: 'firecrawl', boardToken: null, costsCredits: true, previewCount: null, sampleTitles: [] }),
    );
    panel(state, { creditsPaused: true });
    expect(screen.getByTestId('source-detect-result')).toHaveTextContent(
      'No job board API here. We’ll read the page instead (uses about 4 crawl credits a day).',
    );
    expect(screen.getByText(/This page will first be read after 00:00 IST/)).toBeInTheDocument();
  });

  it('duplicate hint offers Show it; a failure offers Try again', async () => {
    const onShowExisting = vi.fn();
    const onRetry = vi.fn();
    const { unmount } = panel(classifyResult('x', 'https://boards.greenhouse.io/stripe', result()), {
      duplicate: { id: 's1', name: 'Stripe' },
      onShowExisting,
    });
    expect(screen.getByText('You already watch this page as “Stripe”.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show it' }));
    expect(onShowExisting).toHaveBeenCalledWith('s1');
    unmount();

    panel(
      {
        status: 'error',
        input: 'x.invalid',
        url: 'https://x.invalid',
        result: null,
        error: { kind: 'unreachable', message: "We couldn't reach that page." },
      },
      { onRetry },
    );
    expect(screen.getByTestId('source-detect-result')).toHaveTextContent("We couldn't reach that page.");
    await userEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
