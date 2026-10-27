import { useState } from 'react';

import { Chip } from '@/features/onboarding/components/OptionCards';
import { Question } from '@/features/onboarding/components/Question';
import { useOnboarding } from '@/features/onboarding/flow/context';
import { COMPETITIVE_PROGRAMMING, POPULAR_STACK } from '@/features/onboarding/flow/options';
import { SkillEditor } from '@/features/profile/components/SkillEditor';
import {
  addSkill,
  hasSkill,
  removeSkill,
  type DraftSkill,
} from '@/features/profile/lib/profile-model';

/** "What do you build with?" (only when the resume gave fewer than three skills). */
export function StackStep() {
  const flow = useOnboarding();
  const [skills, setSkills] = useState<DraftSkill[]>(flow.draft.skills);
  const [cp, setCp] = useState(Boolean(flow.answers.interests?.includes('cp')));
  return (
    <Question
      step="stack"
      prompt="What do you build with?"
      helper="Tap what you use. Search adds anything else."
      width="lg"
      primary={{
        disabled: skills.length === 0,
        hint: 'Add at least one skill.',
        onClick: () => {
          const interests = new Set(flow.answers.interests ?? []);
          if (cp) interests.add('cp');
          else interests.delete('cp');
          flow.complete('stack', { profile: { skills }, answers: { interests: [...interests] } });
        },
      }}
    >
      <SkillEditor skills={skills} onChange={setSkills} />
      <div className="flex flex-col gap-4 border-t border-border-subtle pt-5">
        {POPULAR_STACK.map((g) => (
          <div key={g.group} className="flex flex-col gap-2">
            <p className="text-label uppercase tracking-wide text-fg-tertiary">{g.group}</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label={g.group}>
              {g.items.map((name) => (
                <Chip
                  key={name}
                  pressed={hasSkill(skills, name)}
                  onPressedChange={(next) =>
                    setSkills((s) => (next ? addSkill(s, name) : removeSkill(s, name)))
                  }
                  testId="onboarding-stack-chip"
                >
                  {name}
                </Chip>
              ))}
              {g.group === 'Tools' && (
                <Chip
                  pressed={cp}
                  onPressedChange={setCp}
                  testId="onboarding-stack-chip"
                  data={{ 'data-interest': 'cp' }}
                >
                  {COMPETITIVE_PROGRAMMING}
                </Chip>
              )}
            </div>
          </div>
        ))}
      </div>
    </Question>
  );
}
