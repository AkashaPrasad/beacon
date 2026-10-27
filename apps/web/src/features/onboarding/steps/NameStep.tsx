import { useState } from 'react';

import { useUpdateMe } from '@/api';
import { Input } from '@/components/ui/input';
import { Question } from '@/features/onboarding/components/Question';
import { useOnboarding } from '@/features/onboarding/flow/context';
import { nameIsKnown } from '@/features/onboarding/flow/steps';

/** Step 2: "What should we call you?" (auto-skipped when Google or sign-up already gave a name). */
export function NameStep() {
  const flow = useOnboarding();
  const updateMe = useUpdateMe();
  const [name, setName] = useState(nameIsKnown(flow.me.user) ? flow.me.user.name : '');
  const trimmed = name.trim().replace(/\s+/g, ' ');
  return (
    <Question
      step="name"
      prompt="What should we call you?"
      helper="This is how Beacon greets you. You can change it any time in Profile."
      primary={{
        disabled: trimmed.length === 0,
        hint: 'Type a name to continue.',
        onClick: () => {
          if (trimmed !== flow.me.user.name)
            void flow.track(updateMe.mutateAsync({ name: trimmed })).catch(() => undefined);
          flow.complete('name');
        },
      }}
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={120}
        autoComplete="given-name"
        aria-label="Your name"
        placeholder="First name is fine"
        className="h-control-lg text-body-lg"
        data-testid="onboarding-name-input"
        data-autofocus
      />
    </Question>
  );
}
