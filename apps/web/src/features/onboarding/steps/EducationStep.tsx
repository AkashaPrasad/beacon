import { AnimatePresence, m } from 'motion/react';
import { useId, useMemo, useState } from 'react';

import { Input } from '@/components/ui/input';
import { Chip, OptionCards } from '@/features/onboarding/components/OptionCards';
import { Question } from '@/features/onboarding/components/Question';
import { useOnboarding } from '@/features/onboarding/flow/context';
import { gradYearLine, withName } from '@/features/onboarding/flow/copy';
import {
  BRANCHES,
  DEGREE_CHOICES,
  degreeChoiceOf,
  gradYearChoices,
} from '@/features/onboarding/flow/options';
import { inlineReveal } from '@/features/onboarding/lib/motion';
import { editEducation, primaryEducation, shown } from '@/features/profile/lib/profile-model';

/** Degree, branch and graduation year (asked only when the resume didn't give them). */
export function EducationStep() {
  const flow = useOnboarding();
  const edu = primaryEducation(flow.draft);
  const branchLabel = useId();
  const yearLabel = useId();
  const [degree, setDegree] = useState<string | null>(
    degreeChoiceOf(edu ? shown(edu.degree) : null)?.id ?? null,
  );
  const [branch, setBranch] = useState<string>(edu?.field ?? '');
  const [custom, setCustom] = useState(
    Boolean(edu?.field && !BRANCHES.slice(0, 8).includes(edu.field)),
  );
  const [year, setYear] = useState<number | null>(edu?.gradYear ?? null);
  const years = useMemo(() => gradYearChoices(), []);
  const choice = DEGREE_CHOICES.find((d) => d.id === degree) ?? null;
  const ready = Boolean(choice && year);

  function save() {
    if (!choice || !year) return;
    const next = editEducation(flow.draft, {
      degree: branch.trim() ? `${choice.degree} ${branch.trim()}` : choice.degree,
      degreeLevel: choice.level,
      field: branch.trim() || null,
      gradYear: year,
    });
    flow.complete('education', { profile: { education: next.education } });
  }

  return (
    <Question
      step="education"
      prompt={`What are you studying${withName(flow.firstName)}?`}
      helper="Many internships are open to specific graduation years."
      why="Eligibility rules (“2026 and 2027 graduates only”) are the most common reason a listing doesn’t fit. Your year lets Beacon hide those for you."
      width="lg"
      tip="Tip: press 1–6 to pick, Enter to continue."
      primary={{
        disabled: !ready,
        hint: !choice ? 'Pick your degree.' : 'Pick your graduation year.',
        onClick: save,
      }}
    >
      <OptionCards
        aria-label="Degree"
        options={DEGREE_CHOICES.map((d) => ({ value: d.id, label: d.label, hint: d.hint }))}
        value={degree ? [degree] : []}
        onChange={([v]) => setDegree(v ?? null)}
        hotkeys
        columns={3}
        size="sm"
        testId="onboarding-degree"
      />

      <div className="flex flex-col gap-2">
        <p id={branchLabel} className="text-body font-medium text-fg">
          Branch <span className="font-normal text-fg-tertiary">(optional)</span>
        </p>
        <div role="radiogroup" aria-labelledby={branchLabel} className="flex flex-wrap gap-2">
          {BRANCHES.slice(0, 8).map((b) => (
            <Chip
              key={b}
              kind="choice"
              pressed={!custom && branch === b}
              onPressedChange={(on) => {
                setCustom(false);
                setBranch(on ? b : '');
              }}
              testId="onboarding-branch"
            >
              {b}
            </Chip>
          ))}
          <Chip
            kind="choice"
            pressed={custom}
            onPressedChange={(on) => {
              setCustom(on);
              if (on) setBranch('');
            }}
            testId="onboarding-branch"
          >
            Something else
          </Chip>
        </div>
        <AnimatePresence initial={false}>
          {custom && (
            <m.div key="custom" {...inlineReveal}>
              <Input
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="e.g. Engineering Physics"
                aria-label="Your branch"
                maxLength={120}
                autoFocus
              />
            </m.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex flex-col gap-2">
        <p id={yearLabel} className="text-body font-medium text-fg">
          Graduation year
        </p>
        <div
          role="radiogroup"
          aria-labelledby={yearLabel}
          className="flex flex-wrap gap-2"
          data-testid="onboarding-gradyear"
        >
          {years.map((y) => (
            <Chip
              key={y}
              kind="choice"
              pressed={year === y}
              onPressedChange={(on) => setYear(on ? y : null)}
              testId="onboarding-year"
              data={{ 'data-year': String(y) }}
            >
              <span className="font-mono tabular-nums">{y}</span>
            </Chip>
          ))}
        </div>
        <AnimatePresence initial={false} mode="popLayout">
          {year && (
            <m.p
              key={year}
              {...inlineReveal}
              className="text-small text-fg-secondary"
              aria-live="polite"
            >
              {gradYearLine(year)}
            </m.p>
          )}
        </AnimatePresence>
      </div>
    </Question>
  );
}
