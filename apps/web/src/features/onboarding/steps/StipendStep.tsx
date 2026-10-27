import { useState } from 'react';

import { Slider } from '@/components/ui/slider';
import { Question } from '@/features/onboarding/components/Question';
import { SwitchRow } from '@/features/onboarding/components/SwitchRow';
import { useOnboarding } from '@/features/onboarding/flow/context';
import { STIPEND_SLIDER } from '@/features/onboarding/flow/options';
import { formatStipendFloor, type StipendCurrency } from '@/features/onboarding/lib/preferences';
import { SegmentedControl } from '@/features/settings/components/controls/SegmentedControl';

/** "What's the least you'd accept per month?" (shown only with internships or full-time roles). */
export function StipendStep() {
  const flow = useOnboarding();
  const floor = flow.draft.stipendFloor;
  const [currency, setCurrency] = useState<StipendCurrency>(
    floor?.currency === 'USD' ? 'USD' : 'INR',
  );
  const [amount, setAmount] = useState<number>(
    floor && floor.period === 'month' ? floor.amount : 0,
  );
  const [hideUnpaid, setHideUnpaid] = useState(Boolean(flow.answers.hideUnpaid));
  const range = STIPEND_SLIDER[currency];
  const stipendFloor = amount > 0 ? { amount, currency, period: 'month' as const } : null;

  return (
    <Question
      step="stipend"
      prompt="What’s the least you’d accept per month?"
      helper="Listings below it drop down the list. Nothing disappears."
      why="Unpaid and unlisted stipends are common in internships. A floor keeps them out of your top results without hiding anything."
      liveDraft={{ ...flow.draft, stipendFloor }}
      primary={{
        label: amount > 0 ? `Set ${formatStipendFloor(amount, currency)}` : 'Continue',
        onClick: () =>
          flow.complete('stipend', { profile: { stipendFloor }, answers: { hideUnpaid } }),
      }}
      skip={{
        label: 'Skip — no minimum',
        onSkip: () => flow.complete('stipend', { how: 'skipped' }),
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <p
          className="font-mono text-mono-lg tabular-nums text-fg"
          aria-live="polite"
          data-testid="onboarding-stipend-value"
        >
          {formatStipendFloor(amount, currency)}
        </p>
        <SegmentedControl<StipendCurrency>
          aria-label="Currency"
          size="sm"
          value={currency}
          options={[
            { value: 'INR', label: '₹ INR' },
            { value: 'USD', label: '$ USD' },
          ]}
          onChange={(c) => {
            setCurrency(c);
            setAmount(0);
          }}
        />
      </div>
      <Slider
        min={0}
        max={range.max}
        step={range.step}
        value={[amount]}
        onValueChange={([v]) => setAmount(v ?? 0)}
        thumbLabels={['Stipend floor per month']}
        data-testid="onboarding-stipend-slider"
        data-autofocus
      />
      <div
        className="flex justify-between font-mono text-mono-sm text-fg-tertiary"
        aria-hidden="true"
      >
        <span>No minimum</span>
        <span>{formatStipendFloor(range.max, currency)}</span>
      </div>
      <SwitchRow
        checked={hideUnpaid}
        onCheckedChange={setHideUnpaid}
        label="Also hide unpaid or unlisted"
        description="Keeps listings that don’t say what they pay out of your radar."
        testId="onboarding-hide-unpaid"
      />
    </Question>
  );
}
