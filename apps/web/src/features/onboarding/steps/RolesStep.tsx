import { ChevronDown } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useId, useState } from 'react';

import { Chip, OptionCards } from '@/features/onboarding/components/OptionCards';
import { Question } from '@/features/onboarding/components/Question';
import { useOnboarding } from '@/features/onboarding/flow/context';
import {
  cardsForRoles,
  MAX_ROLES,
  OTHER_ROLE_OPTIONS,
  ROLE_CARDS,
} from '@/features/onboarding/flow/options';
import { inlineReveal } from '@/features/onboarding/lib/motion';
import { suggestRoles } from '@/features/profile/lib/profile-model';
import { cn } from '@kestrel/ui';

/** "What kind of work do you want to do?" Tech families as cards (up to 5), the rest behind "Other". */
export function RolesStep() {
  const flow = useOnboarding();
  const initialRoles =
    flow.draft.preferredRoles.length > 0
      ? flow.draft.preferredRoles
      : suggestRoles(flow.draft.skills, 5);
  const [cards, setCards] = useState<string[]>(() =>
    cardsForRoles(initialRoles).slice(0, MAX_ROLES),
  );
  const [other, setOther] = useState<string[]>(() =>
    initialRoles.filter((r) => OTHER_ROLE_OPTIONS.some((o) => o.id === r)),
  );
  const [showOther, setShowOther] = useState(other.length > 0);
  const otherId = useId();
  const roles = [
    ...new Set([
      ...ROLE_CARDS.filter((c) => cards.includes(c.id)).flatMap((c) => c.roles),
      ...other,
    ]),
  ];
  const picked = cards.length + other.length;
  const full = picked >= MAX_ROLES;
  const suggested = flow.draft.skills.length > 0 && flow.draft.preferredRoles.length === 0;

  return (
    <Question
      step="roles"
      prompt="What kind of work do you want to do?"
      helper={suggested ? 'We picked these from your skills. Up to 5.' : 'Pick up to 5.'}
      width="lg"
      liveDraft={{ ...flow.draft, preferredRoles: roles }}
      primary={{
        disabled: roles.length === 0,
        hint: 'Pick at least one, or skip.',
        onClick: () => flow.complete('roles', { profile: { preferredRoles: roles } }),
      }}
      skip={{
        label: 'Skip — we’ll rank all tech roles equally',
        onSkip: () => flow.complete('roles', { how: 'skipped' }),
      }}
    >
      <OptionCards
        aria-label="Kinds of work"
        multiple
        hotkeys
        max={MAX_ROLES - other.length}
        columns={3}
        size="sm"
        options={ROLE_CARDS.map((c) => ({
          value: c.id,
          label: c.label,
          hint: c.hint,
          icon: c.icon,
          tone: c.tone,
          data: { 'data-role-card': c.id },
        }))}
        value={cards}
        onChange={setCards}
        testId="onboarding-role-card"
      />
      <p className="text-small text-fg-tertiary" aria-live="polite">
        {picked} of {MAX_ROLES} picked
      </p>
      <div>
        <button
          type="button"
          aria-expanded={showOther}
          aria-controls={otherId}
          onClick={() => setShowOther((v) => !v)}
          className="inline-flex items-center gap-1 rounded-xs text-small font-medium text-fg-secondary hover:text-fg focus-visible:focus-ring"
        >
          Other (non-tech)
          <ChevronDown
            className={cn('size-3.5 transition-transform duration-fast', showOther && 'rotate-180')}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </button>
        <AnimatePresence initial={false}>
          {showOther && (
            <m.div
              key="other"
              id={otherId}
              {...inlineReveal}
              className="mt-3 flex flex-wrap gap-2"
              role="group"
              aria-label="Other roles"
            >
              {OTHER_ROLE_OPTIONS.map((o) => {
                const on = other.includes(o.id);
                return (
                  <Chip
                    key={o.id}
                    pressed={on}
                    disabled={!on && full}
                    onPressedChange={(next) =>
                      setOther((r) => (next ? [...r, o.id] : r.filter((x) => x !== o.id)))
                    }
                    testId="onboarding-role"
                    data={{ 'data-role': o.id }}
                  >
                    {o.label}
                  </Chip>
                );
              })}
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </Question>
  );
}
