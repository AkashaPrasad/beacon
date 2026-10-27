import { useState } from 'react';

import { Input } from '@/components/ui/input';
import { Question } from '@/features/onboarding/components/Question';
import { useOnboarding } from '@/features/onboarding/flow/context';

/** Step 1. Always auto-skipped for accounts with an email (every sign-in method has one). */
export function EmailStep() {
  const flow = useOnboarding();
  const [email, setEmail] = useState(flow.me.user.email ?? '');
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  return (
    <Question
      step="email"
      prompt="What’s your email?"
      helper="Only for your account. Beacon sends alerts as web push and in-app, never email."
      primary={{
        disabled: !valid,
        hint: 'Add an email to continue.',
        onClick: () => flow.complete('email', { answers: { contactEmail: email.trim() } }),
      }}
    >
      <Input
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-label="Email"
        className="h-control-lg text-body-lg"
        data-autofocus
      />
    </Question>
  );
}
