import { X } from 'lucide-react';
import { AnimatePresence, LayoutGroup, m } from 'motion/react';
import { useId, useMemo } from 'react';

import { chipMotion, springs } from '@/features/onboarding/lib/motion';
import {
  addSkill,
  groupSkills,
  nextProficiency,
  PROFICIENCY_STEPS,
  proficiencyStep,
  removeSkill,
  setProficiency,
  SKILL_CATEGORY_LABELS,
  type DraftSkill,
} from '@/features/profile/lib/profile-model';
import { TokenCombobox, type ComboOption } from '@/features/settings/components/controls/TokenCombobox';
import { SKILLS } from '@kestrel/shared';
import { cn } from '@kestrel/ui';

let skillOptions: ComboOption[] | undefined;
function getSkillOptions(): ComboOption[] {
  skillOptions ??= SKILLS.map((s) => ({
    value: s.name,
    label: s.name,
    hint: SKILL_CATEGORY_LABELS[s.category],
    keywords: s.aliases,
  }));
  return skillOptions;
}

const POPULAR = ['Python', 'JavaScript', 'TypeScript', 'React', 'Java', 'SQL', 'Git', 'Node.js', 'C++', 'Docker'];

/** Three bars that fill with proficiency (Learning 1 · Working 2 · Strong 3). */
function ProficiencyBars({ level }: { level: 1 | 2 | 3 }) {
  return (
    <span aria-hidden="true" className="flex h-3 items-end gap-[2px]">
      {[1, 2, 3].map((bar) => (
        <m.span
          key={bar}
          initial={false}
          animate={{ scaleY: 1, opacity: bar <= level ? 1 : 0.35 }}
          transition={springs.snappy}
          className={cn(
            'w-[3px] origin-bottom rounded-[1px]',
            bar === 1 ? 'h-1.5' : bar === 2 ? 'h-2.5' : 'h-3',
            bar <= level ? 'bg-current' : 'bg-fg-disabled',
          )}
        />
      ))}
    </span>
  );
}

export interface SkillChipProps {
  skill: DraftSkill;
  onCycle?: () => void;
  onRemove?: () => void;
  readOnly?: boolean;
}

/** One skill: name, a proficiency control that cycles Learning → Working → Strong, and remove. */
export function SkillChip({ skill, onCycle, onRemove, readOnly }: SkillChipProps) {
  const step = proficiencyStep(skill.proficiency);
  const meta = PROFICIENCY_STEPS.find((s) => s.id === step)!;
  const level = (PROFICIENCY_STEPS.indexOf(meta) + 1) as 1 | 2 | 3;
  const next = PROFICIENCY_STEPS.find((s) => s.id === proficiencyStep(nextProficiency(skill.proficiency)))!;

  return (
    <span
      data-testid="profile-skill-chip"
      data-skill={skill.name}
      data-proficiency={step}
      className={cn(
        'group inline-flex h-7 max-w-full items-center rounded-xs border border-border bg-surface-raised text-body text-fg transition-colors duration-fast',
        !readOnly && 'hover:border-border-strong',
        step === 'strong' && 'border-border-strong',
      )}
    >
      <span className="truncate pl-2 pr-1.5">{skill.name}</span>
      {readOnly ? (
        <span className="flex h-full items-center pr-2 text-fg-tertiary" title={meta.label}>
          <ProficiencyBars level={level} />
          <span className="sr-only">, {meta.label}</span>
        </span>
      ) : (
        <>
          <button
            type="button"
            onClick={onCycle}
            title={`${meta.label}. Change to ${next.label}`}
            aria-label={`${skill.name} proficiency: ${meta.label}. Change to ${next.label}`}
            data-testid="profile-skill-proficiency"
            className="hit-area flex h-full items-center gap-1 px-1.5 text-fg-tertiary transition-colors duration-fast hover:bg-surface-hover hover:text-fg focus-visible:focus-ring-inset active:bg-surface-active"
          >
            <ProficiencyBars level={level} />
            <span className="hidden text-caption sm:inline">{meta.label}</span>
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${skill.name}`}
            data-testid="profile-skill-remove"
            className="hit-area flex h-full items-center rounded-r-xs border-l border-border-subtle px-1.5 text-fg-tertiary transition-colors duration-fast hover:bg-surface-hover hover:text-fg focus-visible:focus-ring-inset active:bg-surface-active"
          >
            <X className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </>
      )}
    </span>
  );
}

export interface SkillEditorProps {
  skills: readonly DraftSkill[];
  onChange: (skills: DraftSkill[]) => void;
  /** Group chips under category headings (Profile) or one flowing list (onboarding). */
  grouped?: boolean;
  readOnly?: boolean;
  labelledBy?: string;
  describedBy?: string;
  invalid?: boolean;
  inputTestId?: string;
  className?: string;
}

/** Skills as editable chips, with a taxonomy combobox to add more (USERFLOW §1.4, DESIGN §6.1). */
export function SkillEditor({
  skills,
  onChange,
  grouped = false,
  readOnly = false,
  labelledBy,
  describedBy,
  invalid,
  inputTestId = 'resume-skill-input',
  className,
}: SkillEditorProps) {
  const groupId = useId();
  const groups = useMemo(
    () => (grouped ? groupSkills(skills) : [{ key: 'all', label: '', skills: [...skills] }]),
    [grouped, skills],
  );
  const selected = useMemo(() => skills.map((s) => s.name), [skills]);
  const popular = useMemo(
    () => getSkillOptions().filter((o) => POPULAR.includes(o.value)),
    [],
  );

  const chips = (list: readonly DraftSkill[]) => (
    <ul className="flex flex-wrap gap-1.5" aria-label={grouped ? undefined : 'Skills'}>
      <AnimatePresence initial={false} mode="popLayout">
        {list.map((skill) => (
          <m.li key={skill.name} layout {...chipMotion} className="max-w-full">
            <SkillChip
              skill={skill}
              readOnly={readOnly}
              onCycle={() => onChange(setProficiency(skills, skill.name, nextProficiency(skill.proficiency)))}
              onRemove={() => onChange(removeSkill(skills, skill.name))}
            />
          </m.li>
        ))}
      </AnimatePresence>
    </ul>
  );

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <LayoutGroup id={groupId}>
        {skills.length > 0 &&
          (grouped ? (
            <div className="flex flex-col gap-3">
              {groups.map((g) => (
                <m.section key={g.key} layout="position" transition={{ layout: springs.gentle }} aria-label={g.label}>
                  <h4 className="mb-1.5 text-label uppercase text-fg-tertiary">{g.label}</h4>
                  {chips(g.skills)}
                </m.section>
              ))}
            </div>
          ) : (
            chips(skills)
          ))}
      </LayoutGroup>
      {!readOnly && (
        <TokenCombobox
          options={getSkillOptions()}
          emptyQueryOptions={popular}
          selected={selected}
          allowCustom
          placeholder={skills.length === 0 ? 'Add a skill, e.g. Python' : 'Add another skill'}
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          data-testid={inputTestId}
          onSelect={(value) => onChange(addSkill(skills, value))}
        />
      )}
    </div>
  );
}
