import type { Ref } from 'react';

import { SkillEditor } from '@/features/profile/components/SkillEditor';
import {
  DEGREE_LEVEL_CHOICES,
  displayUrl,
  editEducation,
  gradYearOptions,
  linkOf,
  setLink,
  shown,
  type ProfileDraft,
} from '@/features/profile/lib/profile-model';
import { Field } from '@/features/settings/components/controls/Field';
import { SegmentedControl } from '@/features/settings/components/controls/SegmentedControl';
import { inputClass } from '@/features/settings/components/controls/styles';
import { cn } from '@kestrel/ui';

export interface ManualProfileFormProps {
  draft: ProfileDraft;
  onChange: (next: ProfileDraft) => void;
  errors?: { gradYear?: string | null; skills?: string | null };
  gradYearRef?: Ref<HTMLSelectElement>;
  className?: string;
}

/**
 * Manual fallback (USERFLOW §1.4), in this order: graduation year (required) · degree and field ·
 * institution · skills (≥ 3 suggested) · links · "Have you done an internship before?".
 * Name and email come from Google and are not asked again.
 */
export function ManualProfileForm({ draft, onChange, errors = {}, gradYearRef, className }: ManualProfileFormProps) {
  const edu = draft.education[0] ?? null;
  const internship = draft.experienceYears > 0 || draft.experience.length > 0;

  return (
    <div data-testid="resume-manual-form" className={cn('flex flex-col gap-5', className)}>
      <Field label="Graduation year" hint="Required" error={errors.gradYear}>
        {({ controlId, describedBy }) => (
          <select
            id={controlId}
            ref={gradYearRef}
            data-testid="resume-gradyear-input"
            aria-required="true"
            aria-invalid={Boolean(errors.gradYear) || undefined}
            aria-describedby={describedBy}
            value={edu?.gradYear ?? ''}
            onChange={(e) => {
              const year = Number(e.target.value);
              if (year > 0) onChange(editEducation(draft, { gradYear: year }));
            }}
            className={cn(inputClass, 'w-40 font-mono text-mono')}
          >
            <option value="" disabled>
              Select year
            </option>
            {gradYearOptions().map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        )}
      </Field>

      <div className="grid gap-5 sm:grid-cols-[auto_1fr]">
        <Field label="Degree level" hint="Optional" asGroup>
          {({ labelId }) => (
            <SegmentedControl
              aria-labelledby={labelId}
              value={edu?.degreeLevel ?? 'bachelor'}
              options={DEGREE_LEVEL_CHOICES.map((c) => ({ value: c.value, label: c.label }))}
              onChange={(degreeLevel) => edu && onChange(editEducation(draft, { degreeLevel }))}
            />
          )}
        </Field>
        <Field label="Degree and field" hint="Optional" help={!edu ? 'Pick your graduation year first.' : undefined}>
          {({ controlId, describedBy }) => (
            <input
              id={controlId}
              type="text"
              disabled={!edu}
              aria-describedby={describedBy}
              placeholder="B.Tech Computer Science"
              defaultValue={edu ? shown(edu.degree) : ''}
              key={edu ? 'edu' : 'none'}
              onBlur={(e) => onChange(editEducation(draft, { degree: e.target.value }))}
              className={inputClass}
            />
          )}
        </Field>
      </div>

      <Field label="Institution" hint="Optional">
        {({ controlId, describedBy }) => (
          <input
            id={controlId}
            type="text"
            disabled={!edu}
            aria-describedby={describedBy}
            placeholder="College or university"
            defaultValue={edu ? shown(edu.institution) : ''}
            key={edu ? 'edu' : 'none'}
            onBlur={(e) => onChange(editEducation(draft, { institution: e.target.value }))}
            className={inputClass}
          />
        )}
      </Field>

      <Field
        label="Skills"
        hint={draft.skills.length < 3 ? `${draft.skills.length} of 3 suggested` : `${draft.skills.length} added`}
        help="Languages, frameworks and tools you’d be happy to be tested on."
        error={errors.skills}
        asGroup
      >
        {({ labelId, describedBy }) => (
          <SkillEditor
            skills={draft.skills}
            labelledBy={labelId}
            describedBy={describedBy}
            invalid={Boolean(errors.skills)}
            onChange={(skills) => onChange({ ...draft, skills })}
          />
        )}
      </Field>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1.5 text-body font-medium text-fg">
          Links <span className="text-caption font-normal text-fg-tertiary">Optional</span>
        </legend>
        {(['github', 'linkedin', 'portfolio'] as const).map((kind) => {
          const label = kind === 'github' ? 'GitHub' : kind === 'linkedin' ? 'LinkedIn' : 'Portfolio';
          const id = `manual-link-${kind}`;
          return (
            <div key={kind} className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
              <label htmlFor={id} className="text-small text-fg-secondary">
                {label}
              </label>
              <input
                id={id}
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder={kind === 'github' ? 'github.com/you' : kind === 'linkedin' ? 'linkedin.com/in/you' : 'you.dev'}
                defaultValue={linkOf(draft.links, kind) ? displayUrl(linkOf(draft.links, kind)) : ''}
                onBlur={(e) => onChange({ ...draft, links: setLink(draft.links, kind, e.target.value) })}
                className={cn(inputClass, 'font-mono text-mono')}
              />
            </div>
          );
        })}
      </fieldset>

      <Field label="Have you done an internship before?" hint="Optional" asGroup>
        {({ labelId }) => (
          <SegmentedControl
            aria-labelledby={labelId}
            value={internship ? 'yes' : 'no'}
            options={[
              { value: 'no', label: 'Not yet' },
              { value: 'yes', label: 'Yes' },
            ]}
            onChange={(v) =>
              onChange({ ...draft, experienceYears: v === 'yes' ? Math.max(draft.experienceYears, 0.25) : 0 })
            }
          />
        )}
      </Field>
    </div>
  );
}
