import { useId, useState } from 'react';

import { Chip } from '@/features/onboarding/components/OptionCards';
import { Question } from '@/features/onboarding/components/Question';
import { SwitchRow } from '@/features/onboarding/components/SwitchRow';
import { useOnboarding } from '@/features/onboarding/flow/context';
import { WORK_COUNTRIES } from '@/features/onboarding/flow/options';

/** Step 11: countries the student can work in without a visa, and whether they need sponsorship. */
export function WorkAuthStep() {
  const flow = useOnboarding();
  const auth = flow.draft.workAuth;
  const [countries, setCountries] = useState<string[]>(
    auth.authorisedCountries.length > 0 ? auth.authorisedCountries : ['IN'],
  );
  const [sponsor, setSponsor] = useState(auth.needsSponsorship);
  const label = useId();
  return (
    <Question
      step="work-auth"
      prompt="Where can you work without visa sponsorship?"
      helper="Some roles abroad are open only to citizens or residents."
      primary={{
        disabled: countries.length === 0,
        hint: 'Pick at least one country.',
        onClick: () =>
          flow.complete('work-auth', {
            profile: {
              workAuth: { ...auth, authorisedCountries: countries, needsSponsorship: sponsor },
            },
          }),
      }}
      skip={{
        label: 'Skip — we’ll assume India only',
        onSkip: () => flow.complete('work-auth', { how: 'skipped' }),
      }}
    >
      <p id={label} className="sr-only">
        Countries
      </p>
      <div role="group" aria-labelledby={label} className="flex flex-wrap gap-2">
        {WORK_COUNTRIES.map((c) => (
          <Chip
            key={c.code}
            pressed={countries.includes(c.code)}
            onPressedChange={(on) =>
              setCountries((x) => (on ? [...x, c.code] : x.filter((v) => v !== c.code)))
            }
            testId="onboarding-country"
            data={{ 'data-country': c.code }}
          >
            {c.name}
          </Chip>
        ))}
      </div>
      <SwitchRow
        checked={sponsor}
        onCheckedChange={setSponsor}
        label="I’ll need visa sponsorship elsewhere"
        description="We flag roles abroad that say they don’t sponsor."
        testId="onboarding-sponsorship"
      />
    </Question>
  );
}
