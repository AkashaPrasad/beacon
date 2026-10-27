import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { domMax, LazyMotion, MotionGlobalConfig } from 'motion/react';
import { useState } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';

import { SentenceBuilder, type TokenId } from './SentenceBuilder';
import { draftToInput, emptyDraft, starterDraft, type RuleDraft } from '../lib/rule-draft';

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});

function Harness({ initial }: { initial: RuleDraft }) {
  const [draft, setDraft] = useState(initial);
  const [open, setOpen] = useState<TokenId | null>(null);
  const result = draftToInput(draft, { timezone: 'Asia/Kolkata' });
  return (
    <LazyMotion features={domMax}>
      <SentenceBuilder
        draft={draft}
        update={setDraft}
        errors={result.errors}
        errorId={(f) => `error-${f}`}
        openToken={open}
        setOpenToken={setOpen}
        onTouch={() => undefined}
        zone="IST"
      />
      <output data-testid="out">{JSON.stringify(result.ok ? { ok: true, value: result.value } : { ok: false, errors: result.errors })}</output>
    </LazyMotion>
  );
}

const out = () => JSON.parse(screen.getByTestId('out').textContent ?? '{}') as {
  ok: boolean;
  value?: { conditions: Record<string, unknown>; channels: string[]; cadence: string; digestTime: string };
  errors?: Record<string, string>;
};

describe('SentenceBuilder → alertRuleInputSchema', () => {
  it('edits the fit bracket from its popover', async () => {
    const user = userEvent.setup();
    render(<Harness initial={emptyDraft()} />);
    expect(screen.getByTestId('alerts-cond-fit')).toHaveTextContent('fit ≥ 80');
    await user.click(screen.getByTestId('alerts-cond-fit'));
    const popover = await screen.findByRole('dialog', { name: 'Fit condition' });
    await user.click(within(popover).getByRole('radio', { name: '70 or more' }));
    expect(screen.getByTestId('alerts-cond-fit')).toHaveTextContent('fit ≥ 70');
    expect(out().value?.conditions).toMatchObject({ minFit: 70, types: [], maxDeadlineDays: null });
  });

  it('adds a type condition with + condition, opens it, and maps the choice', async () => {
    const user = userEvent.setup();
    render(<Harness initial={emptyDraft()} />);
    await user.click(screen.getByTestId('alerts-add-condition'));
    await user.click(await screen.findByRole('menuitem', { name: 'Type' }));
    // The new bracket opens its control straight away.
    const popover = await screen.findByRole('dialog', { name: 'Type condition' });
    expect(out()).toMatchObject({ ok: false, errors: { types: 'Pick at least one type, or remove this condition.' } });
    expect(screen.getByTestId('alerts-cond-type')).toHaveAttribute('aria-invalid', 'true');
    await user.click(within(popover).getByRole('option', { name: /Hackathon/ }));
    expect(screen.getByTestId('alerts-cond-type')).toHaveTextContent('type is Hackathon');
    expect(out().value?.conditions).toMatchObject({ types: ['hackathon'] });

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Remove type condition' }));
    expect(screen.queryByTestId('alerts-cond-type')).not.toBeInTheDocument();
    expect(out().value?.conditions).toMatchObject({ types: [] });
  });

  it('toggles channels inline and flags an empty channel list', async () => {
    const user = userEvent.setup();
    render(<Harness initial={starterDraft()} />);
    const push = screen.getByTestId('alerts-channel-push');
    const inapp = screen.getByTestId('alerts-channel-inapp');
    expect(push).toHaveAttribute('aria-pressed', 'true');
    await user.click(push);
    expect(out().value?.channels).toEqual(['inapp']);
    await user.click(inapp);
    expect(out()).toMatchObject({ ok: false, errors: { channels: 'Pick push, in-app or both.' } });
    expect(inapp).toHaveAttribute('aria-invalid', 'true');
    expect(inapp).toHaveAttribute('aria-describedby', 'error-channels');
  });

  it('switches to a daily digest with a time', async () => {
    const user = userEvent.setup();
    render(<Harness initial={emptyDraft()} />);
    await user.click(screen.getByTestId('alerts-cadence'));
    const popover = await screen.findByRole('dialog', { name: 'Frequency condition' });
    await user.click(within(popover).getByRole('radio', { name: /Daily digest/ }));
    expect(screen.getByTestId('alerts-cadence')).toHaveTextContent('daily digest at 08:00');
    expect(out().value).toMatchObject({ cadence: 'daily', digestTime: '08:00' });
  });
});
