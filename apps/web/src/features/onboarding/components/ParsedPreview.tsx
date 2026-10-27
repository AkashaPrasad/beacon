import { AlertCircle, Info, Lightbulb, X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useId, useState, type ReactNode, type Ref } from 'react';

import { chipMotion, tweens } from '@/features/onboarding/lib/motion';
import { InlineText } from '@/features/profile/components/InlineText';
import { SkillEditor } from '@/features/profile/components/SkillEditor';
import {
  displayUrl,
  editEducation,
  gradYearOptions,
  linkOf,
  setLink,
  shown,
  type ProfileDraft,
} from '@/features/profile/lib/profile-model';
import { inputClass } from '@/features/settings/components/controls/styles';
import { getRoleFamily } from '@kestrel/shared';
import { cn, Skeleton, usePrefersReducedMotion } from '@kestrel/ui';

export type PreviewStatus = 'idle' | 'reading' | 'ready';

const SECTION_COUNT = 5;
/** Gap between sections arriving (simulated stream; the deterministic parse returns at once). */
const REVEAL_STEP_MS = 90;

/** Reveals sections one after another once the parse is ready (USERFLOW §1.4 "sections stream in"). */
function useSequentialReveal(status: PreviewStatus): number {
  const reduced = usePrefersReducedMotion();
  // Content that is already there on mount (resuming) shows at once; a fresh parse streams in.
  const [track, setTrack] = useState({ status, count: status === 'ready' ? SECTION_COUNT : 0 });
  if (track.status !== status) {
    setTrack({ status, count: status === 'ready' && reduced ? SECTION_COUNT : 0 });
  }
  const streaming = status === 'ready' && track.count < SECTION_COUNT;
  useEffect(() => {
    if (!streaming) return undefined;
    const timer = setInterval(() => {
      setTrack((t) => (t.count >= SECTION_COUNT ? t : { ...t, count: t.count + 1 }));
    }, REVEAL_STEP_MS);
    return () => clearInterval(timer);
  }, [streaming]);
  return status === 'ready' ? track.count : 0;
}

function Section({
  title,
  ready,
  skeleton,
  children,
  testId,
}: {
  title: string;
  ready: boolean;
  skeleton: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2 py-4 first:pt-0" data-testid={testId}>
      <h3 id={id} className="text-label uppercase text-fg-tertiary">
        {title}
      </h3>
      {/* Skeleton and content share one grid cell, so the swap is a crossfade with no jump (MOTION §5.7). */}
      <div className="grid [&>*]:col-start-1 [&>*]:row-start-1">
        <AnimatePresence initial={false}>
          {ready ? (
            <m.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: tweens.fadeIn }}>
              {children}
            </m.div>
          ) : (
            <m.div
              key="skeleton"
              aria-hidden="true"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0, transition: tweens.fadeOut }}
            >
              {skeleton}
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

const lines = (...widths: string[]) => (
  <div className="flex flex-col gap-2">
    {widths.map((w, i) => (
      <Skeleton key={i} className={cn('h-3.5', w)} />
    ))}
  </div>
);

const chipsSkeleton = (
  <div className="flex flex-wrap gap-1.5">
    {['w-16', 'w-20', 'w-12', 'w-24', 'w-14', 'w-16'].map((w, i) => (
      <Skeleton key={i} className={cn('h-7 rounded-xs', w)} />
    ))}
  </div>
);

export interface ParsedPreviewProps {
  draft: ProfileDraft;
  onChange: (next: ProfileDraft) => void;
  status: PreviewStatus;
  name?: string | null;
  email?: string | null;
  warnings?: readonly string[];
  /** The LLM enriched the deterministic parse (shown as a caption, USERFLOW §1.4). */
  refinedWithAi?: boolean;
  errors?: { gradYear?: string | null; skills?: string | null };
  readOnly?: boolean;
  gradYearRef?: Ref<HTMLSelectElement>;
  className?: string;
}

/** The parsed resume, editable in place. Every field commits on blur; skills edit as chips. */
export function ParsedPreview({
  draft,
  onChange,
  status,
  name,
  email,
  warnings = [],
  refinedWithAi = false,
  errors = {},
  readOnly = false,
  gradYearRef,
  className,
}: ParsedPreviewProps) {
  const revealed = useSequentialReveal(status);
  const ids = { skills: useId(), gradYear: useId(), gradYearError: useId(), skillsError: useId() };
  const edu = draft.education[0] ?? null;
  const years = gradYearOptions();

  const gradYearField = readOnly ? (
    <p className="text-small text-fg-secondary">
      Graduating <span className="font-mono text-mono">{edu?.gradYear ?? '—'}</span>
    </p>
  ) : (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={ids.gradYear} className="text-small font-medium text-fg">
        {edu ? 'Graduation year' : 'Graduation year — we couldn’t find it'}
      </label>
      <select
        id={ids.gradYear}
        ref={gradYearRef}
        data-testid="resume-gradyear-input"
        disabled={readOnly}
        value={edu?.gradYear ?? ''}
        aria-invalid={Boolean(errors.gradYear) || undefined}
        aria-describedby={errors.gradYear ? ids.gradYearError : undefined}
        aria-required="true"
        onChange={(e) => {
          const year = Number(e.target.value);
          if (Number.isInteger(year) && year > 0) onChange(editEducation(draft, { gradYear: year }));
        }}
        className={cn(inputClass, 'w-40 font-mono text-mono')}
      >
        <option value="" disabled>
          Select year
        </option>
        {(edu && !years.includes(edu.gradYear) ? [edu.gradYear, ...years] : years).map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      {errors.gradYear && (
        <p id={ids.gradYearError} role="alert" className="flex items-center gap-1.5 text-small text-danger">
          <AlertCircle className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          {errors.gradYear}
        </p>
      )}
    </div>
  );

  return (
    <div
      data-testid="resume-preview"
      data-status={status}
      aria-busy={status === 'reading' || (status === 'ready' && revealed < SECTION_COUNT)}
      className={cn('flex flex-col divide-y divide-border-subtle', className)}
    >
      <AnimatePresence initial={false}>
        {(warnings.length > 0 || refinedWithAi) && status === 'ready' && (
          <m.ul
            key="notes"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: tweens.fadeIn }}
            exit={{ opacity: 0, transition: tweens.fadeOut }}
            className="flex flex-col gap-1 pb-4"
          >
            {refinedWithAi && (
              <li className="flex items-start gap-2 rounded-sm bg-accent-subtle px-2.5 py-1.5 text-small text-accent-subtle-fg">
                <Lightbulb className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                Refined with AI. Check the highlighted sections and edit anything that looks off.
              </li>
            )}
            {warnings.map((w) => (
              <li
                key={w}
                data-testid="resume-warning"
                className="flex items-start gap-2 text-small text-fg-secondary"
              >
                <Info className="mt-0.5 size-4 shrink-0 text-fg-tertiary" strokeWidth={1.5} aria-hidden="true" />
                {w}
              </li>
            ))}
          </m.ul>
        )}
      </AnimatePresence>

      <Section title="Name & links" ready={revealed > 0} skeleton={lines('w-2/5', 'w-3/5', 'w-1/2')}>
        <div className="flex flex-col gap-1">
          {name && <p className="text-h3 text-fg">{name}</p>}
          {email && <p className="font-mono text-mono-sm text-fg-tertiary">{email}</p>}
          <InlineText
            value={draft.headline ?? ''}
            placeholder="Add a one-line headline"
            aria-label="Headline"
            maxLength={160}
            disabled={readOnly}
            data-testid="onboarding-preview-headline"
            onCommit={(headline) => onChange({ ...draft, headline: headline || null })}
            className="mt-1 text-fg-secondary"
          />
          <dl className="mt-1 grid grid-cols-[6rem_1fr] items-center gap-x-2 gap-y-0.5">
            {(['github', 'linkedin', 'portfolio'] as const).map((kind) => (
              <div key={kind} className="contents">
                <dt className="text-small text-fg-tertiary">
                  {kind === 'github' ? 'GitHub' : kind === 'linkedin' ? 'LinkedIn' : 'Portfolio'}
                </dt>
                <dd className="min-w-0">
                  <InlineText
                    value={linkOf(draft.links, kind) ? displayUrl(linkOf(draft.links, kind)) : ''}
                    placeholder={kind === 'github' ? 'github.com/you' : kind === 'linkedin' ? 'linkedin.com/in/you' : 'you.dev'}
                    aria-label={`${kind === 'github' ? 'GitHub' : kind === 'linkedin' ? 'LinkedIn' : 'Portfolio'} link`}
                    inputMode="url"
                    disabled={readOnly}
                    size="small"
                    onCommit={(url) => onChange({ ...draft, links: setLink(draft.links, kind, url) })}
                    className="font-mono text-mono-sm"
                  />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>

      <Section title="Education" ready={revealed > 1} skeleton={lines('w-3/5', 'w-2/5')}>
        <div className="flex flex-col gap-2">
          {edu && (
            <div className="flex flex-col">
              <InlineText
                value={shown(edu.institution)}
                placeholder="Institution"
                aria-label="Institution"
                disabled={readOnly}
                onCommit={(institution) => onChange(editEducation(draft, { institution }))}
                className="font-medium"
              />
              <InlineText
                value={shown(edu.degree)}
                placeholder="Degree and field, e.g. B.Tech Computer Science"
                aria-label="Degree and field"
                disabled={readOnly}
                onCommit={(degree) => onChange(editEducation(draft, { degree }))}
                className="text-fg-secondary"
              />
            </div>
          )}
          {gradYearField}
        </div>
      </Section>

      <Section title="Skills" ready={revealed > 2} skeleton={chipsSkeleton} testId="onboarding-preview-skills">
        <div className="flex flex-col gap-1.5">
          <span id={ids.skills} className="sr-only">
            Skills
          </span>
          {draft.skills.length === 0 && (
            <p className="text-small text-fg-tertiary">No skills found. Add the ones you use most.</p>
          )}
          <SkillEditor
            skills={draft.skills}
            readOnly={readOnly}
            labelledBy={ids.skills}
            describedBy={errors.skills ? ids.skillsError : undefined}
            invalid={Boolean(errors.skills)}
            onChange={(skills) => onChange({ ...draft, skills })}
          />
          {errors.skills && (
            <p id={ids.skillsError} role="alert" className="flex items-center gap-1.5 text-small text-danger">
              <AlertCircle className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
              {errors.skills}
            </p>
          )}
        </div>
      </Section>

      <Section title="Experience" ready={revealed > 3} skeleton={lines('w-1/2', 'w-1/3')}>
        {draft.experience.length === 0 ? (
          <p className="text-small text-fg-tertiary">No experience found. That’s fine for internships.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false} mode="popLayout">
              {draft.experience.map((x, i) => (
                <m.li key={`${x.company}-${x.title}-${i}`} layout {...chipMotion} className="group flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-medium text-fg">{x.title}</p>
                    <p className="truncate text-small text-fg-secondary">
                      {x.company}
                      {x.startDate && (
                        <span className="font-mono text-mono-sm text-fg-tertiary">
                          {' · '}
                          {x.startDate.getFullYear()}
                          {x.current ? '–now' : x.endDate ? `–${x.endDate.getFullYear()}` : ''}
                        </span>
                      )}
                    </p>
                  </div>
                  {!readOnly && (
                    <RemoveButton
                      label={`Remove ${x.title} at ${x.company}`}
                      onClick={() => onChange({ ...draft, experience: draft.experience.filter((_, j) => j !== i) })}
                    />
                  )}
                </m.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </Section>

      <Section title="Projects" ready={revealed > 4} skeleton={lines('w-2/5', 'w-4/5', 'w-3/5')}>
        {draft.projects.length === 0 ? (
          <p className="text-small text-fg-tertiary">
            No projects found. Projects are the strongest signal for internships; add them on your profile later.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false} mode="popLayout">
              {draft.projects.map((p, i) => (
                <m.li key={`${p.name}-${i}`} layout {...chipMotion} className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-medium text-fg">{p.name}</p>
                    {p.description && <p className="line-clamp-2 text-small text-fg-secondary">{p.description}</p>}
                  </div>
                  {!readOnly && (
                    <RemoveButton
                      label={`Remove project ${p.name}`}
                      onClick={() => onChange({ ...draft, projects: draft.projects.filter((_, j) => j !== i) })}
                    />
                  )}
                </m.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
        {draft.preferredRoles.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5">
            <p className="text-small text-fg-tertiary">Roles we’ll suggest next</p>
            <ul className="flex flex-wrap gap-1.5">
              {draft.preferredRoles.map((role) => (
                <li
                  key={role}
                  className="inline-flex h-6 items-center rounded-xs bg-surface-sunken px-2 text-caption text-fg-secondary"
                >
                  {getRoleFamily(role)?.label ?? role}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>
    </div>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="hit-area grid size-7 shrink-0 place-items-center rounded-sm text-fg-tertiary transition-colors duration-fast hover:bg-surface-hover hover:text-fg focus-visible:focus-ring active:bg-surface-active"
    >
      <X className="size-4" strokeWidth={1.5} />
    </button>
  );
}
