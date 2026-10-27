import { AlertTriangle, AtSign, Check, Code2, FileText, Globe, Sparkles, X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';

import { useUpdateMe } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Question } from '@/features/onboarding/components/Question';
import { useOnboarding } from '@/features/onboarding/flow/context';
import { withName } from '@/features/onboarding/flow/copy';
import { useResumeUpload } from '@/features/onboarding/flow/resume-upload';
import { stepPath } from '@/features/onboarding/flow/steps';
import { chipMotion, contentFade, rowVariants, springs } from '@/features/onboarding/lib/motion';
import { formatBytes } from '@/features/onboarding/lib/resume-file';
import { SkillEditor } from '@/features/profile/components/SkillEditor';
import {
  diffPatch,
  displayUrl,
  editEducation,
  gradYearOptions,
  linkOf,
  primaryEducation,
  setLink,
  shown,
  type ProfileDraft,
} from '@/features/profile/lib/profile-model';
import type { LinkKind } from '@kestrel/shared';
import { cn, Skeleton } from '@kestrel/ui';

const commitOnEnter = (e: KeyboardEvent<HTMLElement>) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.currentTarget.blur();
  }
};

function Section({
  title,
  meta,
  index,
  children,
  testId,
}: {
  title: string;
  meta?: ReactNode;
  index: number;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <m.section
      variants={rowVariants}
      custom={index}
      initial="hidden"
      animate="visible"
      className="flex flex-col gap-3 py-5 first:pt-0 last:pb-0"
      aria-label={title}
      data-testid={testId}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-label uppercase tracking-wide text-fg-tertiary">{title}</h2>
        {meta && <span className="text-caption text-fg-tertiary">{meta}</span>}
      </div>
      {children}
    </m.section>
  );
}

/** Same geometry as the content, so the shimmer resolves into it without a jump (MOTION §5.7). */
function ReadingStages({ phase, progress }: { phase: 'uploading' | 'reading'; progress: number }) {
  const stages = [
    {
      id: 'upload',
      label: phase === 'uploading' ? `Uploading ${Math.round(progress * 100)}%` : 'Uploaded',
    },
    { id: 'text', label: 'Reading the text' },
    { id: 'sections', label: 'Education, skills and projects' },
  ];
  const active = phase === 'uploading' ? 0 : 1;
  return (
    <ol
      className="mb-5 flex flex-wrap gap-x-5 gap-y-1 text-small"
      data-testid="onboarding-reading-stages"
    >
      {stages.map((st, i) => (
        <li
          key={st.id}
          className={cn(
            'inline-flex items-center gap-1.5',
            i <= active ? 'text-fg' : 'text-fg-tertiary',
          )}
          data-state={i < active ? 'done' : i === active ? 'active' : 'waiting'}
        >
          <span
            aria-hidden="true"
            className={cn(
              'grid size-4 place-items-center rounded-full border',
              i < active ? 'border-accent-strong text-accent-strong' : 'border-border',
            )}
          >
            {i < active ? (
              <Check className="size-3" strokeWidth={2.5} />
            ) : i === active ? (
              <span className="size-1.5 rounded-full bg-fg-secondary motion-safe:animate-pulse" />
            ) : null}
          </span>
          {st.label}
        </li>
      ))}
    </ol>
  );
}

function FoundSkeleton({ status }: { status: string }) {
  return (
    <div className="flex flex-col divide-y divide-border-subtle" aria-hidden="true">
      {[
        {
          label: 'w-14',
          rows: (
            <div className="flex flex-wrap gap-1.5">
              {[16, 20, 14, 24, 18, 12, 22, 16].map((w, i) => (
                <Skeleton key={i} className="h-7 rounded-xs" style={{ width: `${w * 4}px` }} />
              ))}
            </div>
          ),
        },
        {
          label: 'w-20',
          rows: (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-9 w-full rounded-md" />
              <Skeleton className="h-9 w-2/3 rounded-md" />
            </div>
          ),
        },
        {
          label: 'w-16',
          rows: (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3.5 w-5/6" />
              <Skeleton className="h-4 w-2/5" />
            </div>
          ),
        },
        {
          label: 'w-12',
          rows: (
            <div className="grid gap-2 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-9 rounded-md" />
              ))}
            </div>
          ),
        },
      ].map((s, i) => (
        <div key={i} className="flex flex-col gap-3 py-5 first:pt-0 last:pb-0">
          <Skeleton className={cn('h-3', s.label)} />
          {s.rows}
        </div>
      ))}
      <span className="sr-only">{status}</span>
    </div>
  );
}

const LINKS: { kind: LinkKind; label: string; icon: typeof Globe; placeholder: string }[] = [
  { kind: 'github', label: 'GitHub', icon: Code2, placeholder: 'github.com/you' },
  { kind: 'linkedin', label: 'LinkedIn', icon: AtSign, placeholder: 'linkedin.com/in/you' },
  { kind: 'portfolio', label: 'Portfolio', icon: Globe, placeholder: 'you.dev' },
];

function LinkField({
  kind,
  label,
  icon: Icon,
  placeholder,
  value,
  onCommit,
}: (typeof LINKS)[number] & { value: string; onCommit: (raw: string) => void }) {
  const [text, setText] = useState(value ? displayUrl(value) : '');
  return (
    <label className="relative flex flex-col gap-1">
      <span className="sr-only">{label}</span>
      <Icon
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-tertiary"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <Input
        value={text}
        placeholder={placeholder}
        inputMode="url"
        autoComplete="url"
        spellCheck={false}
        aria-label={label}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onCommit(text)}
        onKeyDown={commitOnEnter}
        className="pl-9 font-mono text-mono"
        data-testid={`onboarding-link-${kind}`}
      />
    </label>
  );
}

/** Step 5: "Here's what we found" — the parsed profile, editable in place, then confirmed. */
export function FoundStep() {
  const flow = useOnboarding();
  const navigate = useNavigate();
  const upload = useResumeUpload();
  const reading = upload.phase === 'uploading' || upload.phase === 'reading';
  const [local, setLocal] = useState<ProfileDraft | null>(reading ? null : flow.draft);
  const gradId = useId();
  const updateMe = useUpdateMe();
  const [name, setName] = useState(flow.me.user.name ?? '');

  // The shimmer resolves into the parsed profile once the server has read it.
  if (!reading && local === null && upload.phase !== 'failed') setLocal(flow.draft);

  // A failed parse goes back to the dropzone, which explains what went wrong.
  useEffect(() => {
    if (upload.phase === 'failed')
      void navigate(stepPath('resume'), { replace: true, state: { explicit: true } });
  }, [navigate, upload.phase]);

  const status =
    upload.phase === 'uploading'
      ? `Uploading ${Math.round(upload.progress * 100)}%`
      : 'Reading your resume…';
  const edu = local ? primaryEducation(local) : null;
  const missingYear = local !== null && !edu;
  const ready = local !== null && local.skills.length > 0 && !missingYear;
  const warnings = upload.result?.warnings ?? [];
  const file =
    upload.file ??
    (flow.profile.resume
      ? { name: flow.profile.resume.fileName, size: flow.profile.resume.size }
      : null);
  const refined = (upload.result?.parsedFrom ?? flow.profile.resume?.parsedFrom) === 'llm';

  function confirm() {
    if (!local) return;
    if (name && name !== flow.me.user.name)
      void flow.track(updateMe.mutateAsync({ name })).catch(() => undefined);
    flow.complete('found', {
      profile: diffPatch(flow.draft, local),
      answers: flow.applyResumeAutoSkips(local),
    });
  }

  return (
    <Question
      step="found"
      prompt={reading ? 'Reading your resume…' : `Here’s what we found${withName(flow.firstName)}.`}
      promptText={reading ? 'Reading your resume' : 'Here’s what we found'}
      helper={
        reading
          ? 'Text, education, skills and projects. Scans take a little longer.'
          : 'Fix anything that looks off.'
      }
      width="lg"
      bare
      primary={{
        label: 'Looks right',
        disabled: !ready,
        pending: reading,
        hint: reading
          ? null
          : missingYear
            ? 'Add your graduation year.'
            : 'Add at least one skill.',
        onClick: confirm,
      }}
    >
      <div
        className="e2 rounded-xl border border-border-subtle p-4 sm:p-6"
        data-testid="resume-preview"
        data-status={reading ? 'reading' : 'ready'}
        aria-busy={reading || undefined}
      >
        {file && (
          <div className="mb-5 flex items-center gap-3 border-b border-border-subtle pb-4">
            <FileText
              className="size-5 shrink-0 text-fg-secondary"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-body font-medium text-fg" title={file.name}>
                {file.name}
              </span>
              <span
                className="font-mono text-mono-sm text-fg-tertiary"
                role="status"
                aria-live="polite"
              >
                {formatBytes(file.size)} ·{' '}
                {reading ? status : refined ? 'Read, tidied with AI' : 'Read'}
              </span>
            </div>
            {refined && !reading && (
              <Sparkles
                className="size-4 text-accent-strong"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            )}
            {reading && (
              <span
                aria-hidden="true"
                className="relative h-1 w-24 overflow-hidden rounded-full bg-surface-sunken"
              >
                <m.span
                  className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-accent-strong"
                  initial={false}
                  animate={{
                    scaleX: upload.phase === 'reading' ? 1 : Math.max(0.05, upload.progress),
                  }}
                  transition={springs.data}
                />
              </span>
            )}
          </div>
        )}

        <AnimatePresence initial={false} mode="popLayout">
          {reading || !local ? (
            <m.div
              key="skeleton"
              variants={contentFade}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {reading && (
                <ReadingStages
                  phase={upload.phase === 'uploading' ? 'uploading' : 'reading'}
                  progress={upload.progress}
                />
              )}
              <FoundSkeleton status={status} />
            </m.div>
          ) : (
            <m.div
              key="content"
              variants={contentFade}
              initial="hidden"
              animate="visible"
              className="flex flex-col divide-y divide-border-subtle"
            >
              {warnings.length > 0 && (
                <div
                  role="status"
                  className="flex flex-col gap-1 pb-5"
                  data-testid="resume-warning"
                >
                  {warnings.map((w) => (
                    <p key={w} className="flex items-start gap-2 text-small text-fg-secondary">
                      <AlertTriangle
                        className="mt-0.5 size-4 shrink-0 text-warning"
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                      {w}
                    </p>
                  ))}
                </div>
              )}

              <Section title="Name & links" index={0} testId="onboarding-preview-identity">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    defaultValue={name}
                    aria-label="Your name"
                    maxLength={120}
                    onBlur={(e) => setName(e.target.value.trim())}
                    onKeyDown={commitOnEnter}
                    data-testid="onboarding-preview-name"
                  />
                  <Input
                    defaultValue={local.headline ?? ''}
                    placeholder="Headline, e.g. CS ’27 building backend systems in Go"
                    maxLength={160}
                    aria-label="Headline"
                    onBlur={(e) =>
                      setLocal((d) => d && { ...d, headline: e.target.value.trim() || null })
                    }
                    onKeyDown={commitOnEnter}
                    data-testid="onboarding-preview-headline"
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {LINKS.map((l) => (
                    <LinkField
                      key={l.kind}
                      {...l}
                      value={linkOf(local.links, l.kind)}
                      onCommit={(raw) =>
                        setLocal((d) => d && { ...d, links: setLink(d.links, l.kind, raw) })
                      }
                    />
                  ))}
                </div>
              </Section>

              <Section title="Education" index={1}>
                {edu && (
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
                    <Input
                      defaultValue={shown(edu.degree)}
                      aria-label="Degree"
                      placeholder="Degree"
                      onBlur={(e) =>
                        setLocal((d) => d && editEducation(d, { degree: e.target.value }))
                      }
                      onKeyDown={commitOnEnter}
                    />
                    <Input
                      defaultValue={shown(edu.institution)}
                      aria-label="Institution"
                      placeholder="College or university"
                      onBlur={(e) =>
                        setLocal((d) => d && editEducation(d, { institution: e.target.value }))
                      }
                      onKeyDown={commitOnEnter}
                    />
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <label htmlFor={gradId} className="text-body text-fg-secondary">
                    Graduation year
                  </label>
                  <select
                    id={gradId}
                    value={edu?.gradYear ?? ''}
                    onChange={(e) => {
                      const year = Number(e.target.value);
                      if (year) setLocal((d) => d && editEducation(d, { gradYear: year }));
                    }}
                    aria-invalid={missingYear || undefined}
                    data-testid="resume-gradyear-input"
                    data-enter="self"
                    className="h-control rounded-md border border-border-input bg-surface-sunken/70 px-3 font-mono text-mono text-fg focus-visible:focus-ring"
                  >
                    <option value="">Pick a year</option>
                    {gradYearOptions().map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                  {missingYear && (
                    <span className="text-small text-fg-secondary">
                      Graduation year — we couldn’t find it.
                    </span>
                  )}
                </div>
              </Section>

              <Section
                title="Skills"
                meta={`${local.skills.length} found`}
                index={2}
                testId="onboarding-preview-skills"
              >
                <SkillEditor
                  skills={local.skills}
                  onChange={(skills) => setLocal((d) => d && { ...d, skills })}
                  invalid={local.skills.length === 0}
                />
                {local.skills.length === 0 && (
                  <p className="text-small text-fg-secondary">
                    We couldn’t find a skills section. Add a few you use.
                  </p>
                )}
              </Section>

              <Section
                title="Projects"
                meta={
                  local.projects.length > 0 ? 'The strongest signal for internships' : undefined
                }
                index={3}
                testId="onboarding-preview-projects"
              >
                {local.projects.length === 0 ? (
                  <p className="text-small text-fg-tertiary">
                    No projects found. Add them in Profile any time.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    <AnimatePresence initial={false} mode="popLayout">
                      {local.projects.map((p) => (
                        <m.li
                          key={p.name}
                          layout
                          {...chipMotion}
                          className="flex items-start gap-3 rounded-lg border border-border-subtle px-3 py-2.5"
                        >
                          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="truncate text-body font-medium text-fg">{p.name}</span>
                            {p.description && (
                              <span className="line-clamp-2 text-small text-fg-secondary">
                                {p.description}
                              </span>
                            )}
                            {p.skills.length > 0 && (
                              <span className="font-mono text-mono-sm text-fg-tertiary">
                                {p.skills.slice(0, 5).join(' · ')}
                              </span>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove ${p.name}`}
                            onClick={() =>
                              setLocal(
                                (d) =>
                                  d && {
                                    ...d,
                                    projects: d.projects.filter((x) => x.name !== p.name),
                                  },
                              )
                            }
                          >
                            <X className="size-4" strokeWidth={1.5} aria-hidden="true" />
                          </Button>
                        </m.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                )}
              </Section>

              <Section title="Experience" index={4} testId="onboarding-preview-experience">
                {local.experience.length === 0 ? (
                  <p className="text-small text-fg-tertiary">
                    No experience found. Internships and part-time roles count.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    <AnimatePresence initial={false} mode="popLayout">
                      {local.experience.map((x) => (
                        <m.li
                          key={`${x.company}-${x.title}`}
                          layout
                          {...chipMotion}
                          className="flex items-start gap-3 rounded-lg border border-border-subtle px-3 py-2.5"
                        >
                          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="truncate text-body font-medium text-fg">
                              {x.title}{' '}
                              <span className="font-normal text-fg-secondary">· {x.company}</span>
                            </span>
                            {x.description && (
                              <span className="line-clamp-2 text-small text-fg-secondary">
                                {x.description}
                              </span>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove ${x.title} at ${x.company}`}
                            onClick={() =>
                              setLocal(
                                (d) =>
                                  d && { ...d, experience: d.experience.filter((e) => e !== x) },
                              )
                            }
                          >
                            <X className="size-4" strokeWidth={1.5} aria-hidden="true" />
                          </Button>
                        </m.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                )}
              </Section>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </Question>
  );
}
