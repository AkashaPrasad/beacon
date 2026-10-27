import { useState } from 'react';

import { OptionCards } from '@/features/onboarding/components/OptionCards';
import { Question } from '@/features/onboarding/components/Question';
import { useOnboarding } from '@/features/onboarding/flow/context';
import { defaultTypes, interestsFromTypes, TYPE_CARDS } from '@/features/onboarding/flow/options';
import { primaryGradYear } from '@/features/profile/lib/profile-model';
import type { OpportunityType } from '@kestrel/shared';

/** Opportunity types (multi, 1–6, prefilled from the grad year). Also writes `answers.interests`. */
export function TypesStep() {
  const flow = useOnboarding();
  const initial =
    flow.draft.opportunityTypes.length > 0
      ? flow.draft.opportunityTypes
      : defaultTypes(primaryGradYear(flow.draft));
  const [cards, setCards] = useState<string[]>(() =>
    TYPE_CARDS.filter((c) => c.types.some((t) => initial.includes(t))).map((c) => c.id),
  );
  const types = [
    ...new Set(TYPE_CARDS.filter((c) => cards.includes(c.id)).flatMap((c) => c.types)),
  ] as OpportunityType[];

  return (
    <Question
      step="types"
      prompt="What are you looking for?"
      helper="Pick all that apply."
      width="lg"
      tip="Tip: press 1–6 to pick, Enter to continue."
      liveDraft={{ ...flow.draft, opportunityTypes: types }}
      primary={{
        disabled: types.length === 0,
        hint: 'Pick at least one type.',
        onClick: () =>
          flow.complete('types', {
            profile: { opportunityTypes: types },
            answers: {
              interests: interestsFromTypes(types, Boolean(flow.answers.interests?.includes('cp'))),
            },
          }),
      }}
    >
      <OptionCards
        aria-label="Opportunity types"
        multiple
        hotkeys
        columns={3}
        options={TYPE_CARDS.map((c) => ({
          value: c.id,
          label: c.label,
          hint: c.hint,
          icon: c.icon,
          tone: c.tone,
          data: { 'data-type': c.id },
        }))}
        value={cards}
        onChange={setCards}
        testId="onboarding-type-card"
      />
    </Question>
  );
}
