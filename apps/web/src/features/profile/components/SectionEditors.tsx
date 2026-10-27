import { ExternalLink, X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useId, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { chipMotion, inlineReveal } from '@/features/onboarding/lib/motion';
import { InlineText } from '@/features/profile/components/InlineText';
import { AddButton } from '@/features/profile/components/Ledger';
import {
  canonicalSkillName,
  DEGREE_LEVEL_LABELS,
  displayUrl,
  editEducation,
  gradYearOptions,
  LINK_LABELS,
  linkOf,
  normaliseLinkUrl,
  removeEducation,
  setLink,
  shown,
  SKILL_CATEGORY_LABELS,
  type DraftExperience,
  type DraftProject,
  type ProfileDraft,
} from '@/features/profile/lib/profile-model';
import type { ProfileUpdate } from '@/features/profile/lib/use-profile-editor';
import { inputClass } from '@/features/settings/components/controls/styles';
import { TokenCombobox, type ComboOption } from '@/features/settings/components/controls/TokenCombobox';
import { DEGREE_LEVELS, LINK_KINDS, SKILLS, type DegreeLevel, type LinkKind } from '@kestrel/shared';
import { cn } from '@kestrel/ui';

type Commit = (update: ProfileUpdate, message?: string | null) => void;

export function RemoveIcon({ label, onClick, testId }: { label: string; onClick: () => void; testId?: string }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      onClick={onClick}
      data-testid={testId}
      className="shrink-0 text-fg-tertiary opacity-100 transition-opacity duration-fast sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
    >
      <X className="size-4" strokeWidth={1.5} />
    </Button>
  );
}

const selectClass = cn(inputClass, 'h-control-sm w-auto appearance-auto px-2 text-small');

// ── Education ─────────────────────────────────────────────────────────────────────────────────────

export function EducationEditor({ draft, commit }: { draft: ProfileDraft; commit: Commit }) {
  const years = gradYearOptions();
  if (draft.education.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-small text-fg-tertiary">Your graduation year decides which listings you’re eligible for.</p>
        <AddButton
          data-testid="profile-education-add"
          onClick={() => commit((d) => editEducation(d, { gradYear: new Date().getFullYear() + 1 }), 'Added education.')}
        >
          Add education
        </AddButton>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-4">
        <AnimatePresence initial={false} mode="popLayout">
          {draft.education.map((edu, i) => (
            <m.li key={`edu-${i}`} layout {...chipMotion} className="group flex items-start gap-2" data-testid="profile-education-item">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <InlineText
                  value={shown(edu.institution)}
                  placeholder="Institution"
                  aria-label="Institution"
                  maxLength={200}
                  onCommit={(institution) => commit((d) => editEducation(d, { institution }, i), 'Education updated.')}
                  className="font-medium"
                />
                <InlineText
                  value={shown(edu.degree)}
                  placeholder="Degree and field, e.g. B.Tech Computer Science"
                  aria-label="Degree and field"
                  maxLength={120}
                  onCommit={(degree) => commit((d) => editEducation(d, { degree }, i), 'Education updated.')}
                  className="text-fg-secondary"
                />
                <div className="mt-1 flex flex-wrap items-center gap-2 text-small text-fg-tertiary">
                  <select
                    aria-label="Degree level"
                    value={edu.degreeLevel}
                    onChange={(e) =>
                      commit((d) => editEducation(d, { degreeLevel: e.target.value as DegreeLevel }, i), 'Education updated.')
                    }
                    className={selectClass}
                  >
                    {DEGREE_LEVELS.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {DEGREE_LEVEL_LABELS[lvl]}
                      </option>
                    ))}
                  </select>
                  <span>Class of</span>
                  <select
                    aria-label="Graduation year"
                    value={edu.gradYear}
                    data-testid="profile-gradyear"
                    onChange={(e) =>
                      commit((d) => editEducation(d, { gradYear: Number(e.target.value) }, i), 'Graduation year updated.')
                    }
                    className={cn(selectClass, 'font-mono text-mono-sm')}
                  >
                    {(years.includes(edu.gradYear) ? years : [edu.gradYear, ...years]).map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <RemoveIcon
                label={`Remove ${shown(edu.institution) || 'this education entry'}`}
                onClick={() => commit((d) => removeEducation(d, i), 'Removed education entry.')}
              />
            </m.li>
          ))}
        </AnimatePresence>
      </ul>
      {draft.education.length < 10 && (
        <AddButton
          data-testid="profile-education-add"
          onClick={() =>
            commit((d) => editEducation(d, { gradYear: new Date().getFullYear() + 2 }, d.education.length), 'Added education.')
          }
        >
          Add another
        </AddButton>
      )}
    </div>
  );
}

// ── Experience ────────────────────────────────────────────────────────────────────────────────────

const toMonth = (d: Date | null) => (d ? d.toISOString().slice(0, 7) : '');
const fromMonth = (v: string) => {
  const [y, mo] = v.split('-').map(Number);
  return y && mo ? new Date(Date.UTC(y, mo - 1, 1)) : null;
};
const monthLabel = (d: Date | null) =>
  d ? new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d) : '';

function NewEntryForm({
  fields,
  submitLabel,
  onSubmit,
  onCancel,
  testId,
}: {
  fields: { name: string; label: string; placeholder: string; required?: boolean; type?: string }[];
  submitLabel: string;
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
  testId: string;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const id = useId();
  const valid = fields.every((f) => !f.required || (values[f.name] ?? '').trim());
  return (
    <m.form
      {...inlineReveal}
      data-testid={testId}
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(values);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        }
      }}
      className="flex flex-col gap-3 rounded-md border border-border bg-surface-raised p-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f, i) => (
          <label key={f.name} htmlFor={`${id}-${f.name}`} className={cn('flex flex-col gap-1', f.type === 'textarea' && 'sm:col-span-2')}>
            <span className="text-small font-medium text-fg">
              {f.label}
              {!f.required && <span className="font-normal text-fg-tertiary"> · optional</span>}
            </span>
            {f.type === 'textarea' ? (
              <textarea
                id={`${id}-${f.name}`}
                rows={2}
                placeholder={f.placeholder}
                value={values[f.name] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                className={cn(inputClass, 'h-auto resize-y py-2')}
              />
            ) : (
              <input
                id={`${id}-${f.name}`}
                type={f.type ?? 'text'}
                required={f.required}
                autoFocus={i === 0}
                placeholder={f.placeholder}
                value={values[f.name] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                className={cn(inputClass, f.type === 'url' && 'font-mono text-mono')}
              />
            )}
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={!valid}>
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </m.form>
  );
}

export function ExperienceEditor({ draft, commit }: { draft: ProfileDraft; commit: Commit }) {
  const [adding, setAdding] = useState(false);
  const edit = (i: number, patch: Partial<DraftExperience>, message = 'Experience updated.') =>
    commit((d) => ({ ...d, experience: d.experience.map((x, j) => (j === i ? { ...x, ...patch } : x)) }), message);

  return (
    <div className="flex flex-col gap-4">
      {draft.experience.length === 0 && !adding && (
        <p className="text-small text-fg-tertiary">No experience yet. That’s fine for internships: projects carry more weight.</p>
      )}
      <ul className="flex flex-col gap-5">
        <AnimatePresence initial={false} mode="popLayout">
          {draft.experience.map((x, i) => (
            <m.li key={`exp-${i}-${x.company}`} layout {...chipMotion} className="group flex items-start gap-2" data-testid="profile-experience-item">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <InlineText value={x.title} aria-label="Role" maxLength={200} onCommit={(title) => title && edit(i, { title })} className="font-medium" />
                <InlineText value={x.company} aria-label="Company" maxLength={200} onCommit={(company) => company && edit(i, { company })} className="text-fg-secondary" />
                <div className="mt-1 flex flex-wrap items-center gap-2 text-small text-fg-tertiary">
                  <input
                    type="month"
                    aria-label="Start month"
                    value={toMonth(x.startDate)}
                    onChange={(e) => edit(i, { startDate: fromMonth(e.target.value) })}
                    className={cn(selectClass, 'font-mono text-mono-sm')}
                  />
                  <span aria-hidden="true">–</span>
                  {x.current ? (
                    <span className="font-mono text-mono-sm">now</span>
                  ) : (
                    <input
                      type="month"
                      aria-label="End month"
                      value={toMonth(x.endDate)}
                      onChange={(e) => edit(i, { endDate: fromMonth(e.target.value) })}
                      className={cn(selectClass, 'font-mono text-mono-sm')}
                    />
                  )}
                  <label className="ml-1 inline-flex items-center gap-1.5">
                    <Checkbox
                      checked={x.current}
                      onCheckedChange={(v) => edit(i, { current: v === true, ...(v === true ? { endDate: null } : {}) })}
                    />
                    I work here now
                  </label>
                </div>
                <InlineText
                  multiline
                  value={x.description ?? ''}
                  placeholder="What you built, with a number if you have one"
                  aria-label={`What you did at ${x.company}`}
                  maxLength={5000}
                  onCommit={(description) => edit(i, { description: description || null })}
                  className="mt-1 text-small text-fg-secondary"
                />
              </div>
              <RemoveIcon
                label={`Remove ${x.title} at ${x.company}`}
                onClick={() =>
                  commit((d) => ({ ...d, experience: d.experience.filter((_, j) => j !== i) }), `Removed ${x.title}.`)
                }
              />
            </m.li>
          ))}
        </AnimatePresence>
      </ul>
      <AnimatePresence initial={false} mode="popLayout">
        {adding ? (
          <NewEntryForm
            key="form"
            testId="profile-experience-form"
            submitLabel="Add experience"
            fields={[
              { name: 'title', label: 'Role', placeholder: 'Backend Intern', required: true },
              { name: 'company', label: 'Company', placeholder: 'Kaveri Labs', required: true },
              { name: 'description', label: 'What you did', placeholder: 'Built…', type: 'textarea' },
            ]}
            onCancel={() => setAdding(false)}
            onSubmit={(v) => {
              setAdding(false);
              commit(
                (d) => ({
                  ...d,
                  experience: [
                    ...d.experience,
                    {
                      title: v.title!.trim(),
                      company: v.company!.trim(),
                      description: v.description?.trim() || null,
                      startDate: null,
                      endDate: null,
                      current: false,
                    },
                  ],
                }),
                `Added ${v.title!.trim()}.`,
              );
            }}
          />
        ) : (
          <AddButton key="add" data-testid="profile-experience-add" onClick={() => setAdding(true)}>
            Add experience
          </AddButton>
        )}
      </AnimatePresence>
      {draft.experience.length > 0 && (
        <p className="sr-only">
          {draft.experience.map((x) => `${x.title}, ${x.company}, ${monthLabel(x.startDate)}`).join('; ')}
        </p>
      )}
    </div>
  );
}

// ── Projects ──────────────────────────────────────────────────────────────────────────────────────

let skillOptions: ComboOption[] | undefined;
const getSkillOptions = () =>
  (skillOptions ??= SKILLS.map((s) => ({ value: s.name, label: s.name, hint: SKILL_CATEGORY_LABELS[s.category], keywords: s.aliases })));

export function ProjectsEditor({
  draft,
  commit,
  onAddRef,
}: {
  draft: ProfileDraft;
  commit: Commit;
  onAddRef?: (el: HTMLButtonElement | null) => void;
}) {
  const [adding, setAdding] = useState(false);
  const edit = (i: number, patch: Partial<DraftProject>, message = 'Project updated.') =>
    commit((d) => ({ ...d, projects: d.projects.map((p, j) => (j === i ? { ...p, ...patch } : p)) }), message);

  return (
    <div className="flex flex-col gap-4">
      {draft.projects.length === 0 && !adding && (
        <div className="flex flex-col gap-1 rounded-md border border-dashed border-border-strong px-4 py-5" data-testid="profile-projects-empty">
          <p className="text-h3 text-fg">No projects yet.</p>
          <p className="text-body text-fg-secondary">Projects are the strongest signal for internships. Add one or two.</p>
        </div>
      )}
      <ul className="flex flex-col gap-5">
        <AnimatePresence initial={false} mode="popLayout">
          {draft.projects.map((p, i) => (
            <m.li key={`prj-${i}-${p.name}`} layout {...chipMotion} className="group flex items-start gap-2" data-testid="profile-project-item">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex min-w-0 items-center gap-1">
                  <InlineText value={p.name} aria-label="Project name" maxLength={160} onCommit={(name) => name && edit(i, { name })} className="font-medium" />
                  {p.url && (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${p.name}`}
                      className="hit-area grid size-7 shrink-0 place-items-center rounded-sm text-fg-tertiary hover:bg-surface-hover hover:text-fg focus-visible:focus-ring"
                    >
                      <ExternalLink className="size-4" strokeWidth={1.5} />
                    </a>
                  )}
                </div>
                <InlineText
                  multiline
                  value={p.description ?? ''}
                  placeholder="One or two lines: what it does, who used it"
                  aria-label={`Describe ${p.name}`}
                  maxLength={5000}
                  onCommit={(description) => edit(i, { description: description || null })}
                  className="text-small text-fg-secondary"
                />
                <InlineText
                  value={p.url ? displayUrl(p.url) : ''}
                  placeholder="Link (GitHub, demo)"
                  aria-label={`Link for ${p.name}`}
                  inputMode="url"
                  size="small"
                  onCommit={(raw) => edit(i, { url: raw ? normaliseLinkUrl(raw) : null })}
                  className="font-mono text-mono-sm"
                />
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {p.skills.map((s) => (
                    <span key={s} className="inline-flex h-7 items-center gap-0.5 rounded-xs bg-surface-sunken pr-0.5 pl-2 text-caption text-fg-secondary">
                      {s}
                      <button
                        type="button"
                        aria-label={`Remove ${s} from ${p.name}`}
                        onClick={() => edit(i, { skills: p.skills.filter((x) => x !== s) })}
                        className="grid size-6 place-items-center rounded-xs hover:bg-surface-hover hover:text-fg focus-visible:focus-ring-inset"
                      >
                        <X className="size-3" strokeWidth={1.5} />
                      </button>
                    </span>
                  ))}
                  <TokenCombobox
                    options={getSkillOptions()}
                    selected={p.skills}
                    allowCustom
                    placeholder="Add a skill"
                    aria-label={`Add a skill to ${p.name}`}
                    className="w-40"
                    inputClassName="h-6 text-caption"
                    onSelect={(value) => {
                      const name = canonicalSkillName(value);
                      if (name && !p.skills.includes(name)) edit(i, { skills: [...p.skills, name] });
                    }}
                  />
                </div>
              </div>
              <RemoveIcon
                label={`Remove project ${p.name}`}
                testId="profile-project-remove"
                onClick={() => commit((d) => ({ ...d, projects: d.projects.filter((_, j) => j !== i) }), `Removed “${p.name}”.`)}
              />
            </m.li>
          ))}
        </AnimatePresence>
      </ul>
      <AnimatePresence initial={false} mode="popLayout">
        {adding ? (
          <NewEntryForm
            key="form"
            testId="profile-project-form"
            submitLabel="Add project"
            fields={[
              { name: 'name', label: 'Name', placeholder: 'Hostel mess tracker', required: true },
              { name: 'url', label: 'Link', placeholder: 'github.com/you/project', type: 'url' },
              { name: 'description', label: 'What it does', placeholder: 'Used by 400 students to…', type: 'textarea' },
            ]}
            onCancel={() => setAdding(false)}
            onSubmit={(v) => {
              setAdding(false);
              commit(
                (d) => ({
                  ...d,
                  projects: [
                    ...d.projects,
                    {
                      name: v.name!.trim(),
                      url: v.url ? normaliseLinkUrl(v.url) : null,
                      description: v.description?.trim() || null,
                      skills: [],
                    },
                  ],
                }),
                `Added “${v.name!.trim()}”.`,
              );
            }}
          />
        ) : (
          <AddButton key="add" ref={onAddRef} data-testid="profile-project-add" onClick={() => setAdding(true)}>
            Add project
          </AddButton>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Links ─────────────────────────────────────────────────────────────────────────────────────────

const PRIMARY_LINKS: readonly LinkKind[] = ['github', 'linkedin', 'portfolio'];
const MORE_LINKS = LINK_KINDS.filter((k) => !PRIMARY_LINKS.includes(k));
const LINK_PLACEHOLDER: Partial<Record<LinkKind, string>> = {
  github: 'github.com/you',
  linkedin: 'linkedin.com/in/you',
  portfolio: 'you.dev',
  leetcode: 'leetcode.com/u/you',
  kaggle: 'kaggle.com/you',
  devpost: 'devpost.com/you',
  scholar: 'scholar.google.com/…',
  other: 'any link',
};

export function LinksEditor({ draft, commit }: { draft: ProfileDraft; commit: Commit }) {
  const hasMore = MORE_LINKS.some((k) => linkOf(draft.links, k));
  const [more, setMore] = useState(hasMore);
  const row = (kind: LinkKind): ReactNode => {
    const url = linkOf(draft.links, kind);
    return (
      <div key={kind} className="contents">
        <dt className="pt-1.5 text-small text-fg-tertiary">{LINK_LABELS[kind]}</dt>
        <dd className="flex min-w-0 items-center gap-1">
          <InlineText
            value={url ? displayUrl(url) : ''}
            placeholder={LINK_PLACEHOLDER[kind]}
            aria-label={`${LINK_LABELS[kind]} link`}
            inputMode="url"
            data-testid="profile-link-input"
            onCommit={(raw) =>
              commit(
                (d) => ({ ...d, links: setLink(d.links, kind, raw) }),
                raw ? `${LINK_LABELS[kind]} link updated.` : `Removed ${LINK_LABELS[kind]} link.`,
              )
            }
            className="font-mono text-mono"
          />
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${LINK_LABELS[kind]}`}
              className="hit-area grid size-7 shrink-0 place-items-center rounded-sm text-fg-tertiary hover:bg-surface-hover hover:text-fg focus-visible:focus-ring"
            >
              <ExternalLink className="size-4" strokeWidth={1.5} />
            </a>
          )}
        </dd>
      </div>
    );
  };
  return (
    <div className="flex flex-col gap-2">
      <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1">
        {PRIMARY_LINKS.map(row)}
        {more && MORE_LINKS.map(row)}
      </dl>
      {!more && (
        <button
          type="button"
          onClick={() => setMore(true)}
          className="self-start rounded-xs text-small font-medium text-accent-strong underline-offset-3 hover:underline focus-visible:focus-ring"
        >
          More links: LeetCode, Kaggle, Devpost, Scholar
        </button>
      )}
    </div>
  );
}
