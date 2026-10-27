import { AlertCircle, CircleCheck, Eye, Loader2, PenLine } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useCallback, useMemo, useRef, useState } from 'react';

import { useMe, useUpdateMe } from '@/api';
import { useCommandItems } from '@/components/command-palette/registry';
import { initials } from '@/components/shell/initials';
import { Button } from '@/components/ui/button';
import { tweens } from '@/features/onboarding/lib/motion';
import { CompletenessMeter } from '@/features/profile/components/CompletenessMeter';
import { InlineText } from '@/features/profile/components/InlineText';
import { LedgerSection } from '@/features/profile/components/Ledger';
import { PreferencesPanel, PreferencesSummary } from '@/features/profile/components/Preferences';
import { RecruiterPreview } from '@/features/profile/components/RecruiterPreview';
import { ResumeRow } from '@/features/profile/components/ResumeRow';
import {
  EducationEditor,
  ExperienceEditor,
  LinksEditor,
  ProjectsEditor,
} from '@/features/profile/components/SectionEditors';
import { SkillEditor } from '@/features/profile/components/SkillEditor';
import { completeness, primaryEducation, type ProfileDraft } from '@/features/profile/lib/profile-model';
import { useProfileEditor } from '@/features/profile/lib/use-profile-editor';
import { SegmentedControl } from '@/features/settings/components/controls/SegmentedControl';
import { errorMessage } from '@/lib/api';
import { withUndo } from '@/lib/undo';
import { cn, PageHeader, Skeleton, usePrefersReducedMotion } from '@kestrel/ui';

type View = 'edit' | 'preview';

/** Completeness item → the section it jumps to. */
const ITEM_SECTION: Record<string, string> = {
  education: 'profile-education',
  skills: 'profile-skills',
  types: 'profile-preferences',
  roles: 'profile-preferences',
  projects: 'profile-projects',
  links: 'profile-links',
  headline: 'profile-identity',
  resume: 'profile-resume-section',
};

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" data-testid="profile-skeleton">
      <div className="flex items-start gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="flex flex-1 flex-col gap-2 pt-1">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="grid gap-3 border-t border-border-subtle py-6 sm:grid-cols-[10rem_1fr]">
          <Skeleton className="h-3.5 w-20" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-4 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SaveState({ pending }: { pending: boolean }) {
  return (
    <span aria-live="polite" className="inline-flex min-w-16 items-center gap-1 text-caption text-fg-tertiary" data-testid="profile-save-state">
      <AnimatePresence initial={false} mode="popLayout">
        {pending ? (
          <m.span key="saving" className="inline-flex items-center gap-1" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: tweens.fadeIn }} exit={{ opacity: 0, transition: tweens.fadeOut }}>
            <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" strokeWidth={1.5} aria-hidden="true" />
            Saving
          </m.span>
        ) : (
          <m.span key="saved" className="inline-flex items-center gap-1" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: tweens.fadeIn }} exit={{ opacity: 0, transition: tweens.fadeOut }}>
            <CircleCheck className="size-3.5 text-success" strokeWidth={1.5} aria-hidden="true" />
            Saved
          </m.span>
        )}
      </AnimatePresence>
    </span>
  );
}

function Identity({
  draft,
  name,
  email,
  onHeadline,
  onName,
}: {
  draft: ProfileDraft;
  name: string;
  email: string | null;
  onHeadline: (headline: string) => void;
  onName: (name: string) => void;
}) {
  const edu = primaryEducation(draft);
  const meta = [edu ? `Class of ${edu.gradYear}` : null, draft.preferredLocations[0] ?? null].filter(Boolean);
  return (
    <div id="profile-identity" className="flex scroll-mt-[calc(var(--topbar-h)+1rem)] items-start gap-4 pb-6" data-testid="profile-identity">
      <span
        aria-hidden="true"
        className="grid size-14 shrink-0 place-items-center rounded-full bg-avatar-3 font-medium text-h2 text-fg-secondary"
      >
        {initials(name)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <InlineText
          value={name}
          size="h1"
          aria-label="Your name"
          maxLength={120}
          onCommit={(next) => next && onName(next)}
          data-testid="profile-name"
          className="max-sm:text-h1"
        />
        <InlineText
          value={draft.headline ?? ''}
          placeholder="Add a one-line headline, e.g. CS ’27 building backend systems in Go"
          aria-label="Headline"
          maxLength={160}
          onCommit={onHeadline}
          data-testid="profile-headline"
          className="text-fg-secondary"
        />
        <p className="mt-1 flex flex-wrap gap-x-2 font-mono text-mono-sm text-fg-tertiary">
          {email && <span>{email}</span>}
          {meta.map((x) => (
            <span key={x}>
              <span aria-hidden="true">· </span>
              {x}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}

/**
 * `/profile` — a Read.cv-style structured resume (DESIGN §6.1): identity, skills by category with a
 * three-step proficiency, education, experience, projects, links and a preferences summary, all edited
 * in place with optimistic saves and undo. "What recruiters see" is the same profile, read-only.
 */
export function Component() {
  const me = useMe();
  const updateMe = useUpdateMe();
  const { profile, draft, commit, pending } = useProfileEditor();
  const [view, setView] = useState<View>('edit');
  const [prefs, setPrefs] = useState({ open: false, session: 0 });
  const projectAdd = useRef<HTMLButtonElement | null>(null);
  const reduced = usePrefersReducedMotion();

  const name = me.data?.user.name ?? '';
  const email = me.data?.user.email ?? null;
  const score = useMemo(
    () => (draft ? completeness(draft, { hasResume: Boolean(profile.data?.resume) }) : null),
    [draft, profile.data?.resume],
  );

  const openPrefs = useCallback(() => setPrefs((p) => ({ open: true, session: p.session + 1 })), []);

  useCommandItems(
    () => [
      { id: 'profile.preferences', group: 'Actions', label: 'Edit preferences', keywords: ['roles', 'location', 'stipend'], perform: openPrefs },
      { id: 'profile.preview', group: 'Views', label: 'What recruiters see', perform: () => setView('preview') },
    ],
    [openPrefs],
  );

  function go(key: string) {
    setView('edit');
    if (key === 'types' || key === 'roles') {
      openPrefs();
      return;
    }
    requestAnimationFrame(() => {
      const target = document.getElementById(ITEM_SECTION[key] ?? '');
      target?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      const focusable =
        key === 'projects' && projectAdd.current
          ? projectAdd.current
          : target?.querySelector<HTMLElement>('input, button, select, textarea');
      focusable?.focus({ preventScroll: true });
    });
  }

  function rename(next: string) {
    const previous = name;
    if (next === previous) return;
    withUndo({
      message: 'Name updated.',
      run: () => updateMe.mutateAsync({ name: next }),
      undo: () => updateMe.mutateAsync({ name: previous }),
    }).promise.catch(() => undefined);
  }

  const header = (
    <PageHeader
      title="Profile"
      meta={draft ? <SaveState pending={pending} /> : null}
      actions={
        <SegmentedControl<View>
          aria-label="Profile view"
          size="sm"
          value={view}
          data-testid="profile-view"
          options={[
            { value: 'edit', label: 'Edit', icon: PenLine, testId: 'profile-view-edit' },
            { value: 'preview', label: 'What recruiters see', icon: Eye, testId: 'profile-view-preview' },
          ]}
          onChange={setView}
        />
      }
    />
  );

  if (profile.isError && !profile.data) {
    return (
      <div data-testid="profile-page" className="flex flex-col">
        {header}
        <div role="alert" className="flex flex-col items-start gap-3 px-gutter py-10" data-testid="profile-error">
          <p className="flex items-center gap-2 text-body font-medium text-fg">
            <AlertCircle className="size-4 text-danger" strokeWidth={1.5} aria-hidden="true" />
            Couldn’t load your profile.
          </p>
          <p className="text-small text-fg-secondary">{errorMessage(profile.error)}</p>
          <Button variant="secondary" onClick={() => void profile.refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="profile-page" data-view={view} className="flex flex-col">
      {header}
      <div className="px-gutter pb-16">
        <div className="grid w-full max-w-content gap-10 xl:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="min-w-0">
            {!draft || !score ? (
              <ProfileSkeleton />
            ) : (
              <AnimatePresence initial={false} mode="popLayout">
                {view === 'edit' ? (
                  <m.div
                    key="edit"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: tweens.fadeIn }}
                    exit={{ opacity: 0, transition: tweens.fadeOut }}
                    data-testid="profile-editor"
                  >
                    <Identity
                      draft={draft}
                      name={name}
                      email={email}
                      onName={rename}
                      onHeadline={(headline) => commit((d) => ({ ...d, headline: headline || null }), 'Headline updated.')}
                    />
                    <div className="mb-2 xl:hidden">
                      <CompletenessMeter percent={score.percent} items={score.items} next={score.next} onGo={go} />
                    </div>

                    <LedgerSection label="About" hint="Two or three lines in your own words.">
                      <InlineText
                        multiline
                        value={draft.summary ?? ''}
                        placeholder="What you’re building, what you want to learn next."
                        aria-label="About you"
                        maxLength={2000}
                        onCommit={(summary) => commit((d) => ({ ...d, summary: summary || null }), 'About updated.')}
                        data-testid="profile-summary"
                        className="text-body text-fg"
                      />
                    </LedgerSection>

                    <LedgerSection id="profile-skills" label="Skills" hint="Tap the bars to set Learning, Working or Strong." data-testid="profile-skills">
                      <SkillEditor
                        grouped
                        skills={draft.skills}
                        labelledBy={undefined}
                        inputTestId="profile-skill-input"
                        onChange={(skills) => {
                          const before = draft.skills;
                          const removed = before.find((s) => !skills.some((x) => x.name === s.name));
                          const added = skills.find((s) => !before.some((x) => x.name === s.name));
                          commit(
                            (d) => ({ ...d, skills }),
                            removed ? `Removed ${removed.name}.` : added ? `Added ${added.name}.` : null,
                          );
                        }}
                      />
                    </LedgerSection>

                    <LedgerSection id="profile-education" label="Education" hint="Eligibility rules read the latest graduation year." data-testid="profile-education">
                      <EducationEditor draft={draft} commit={commit} />
                    </LedgerSection>

                    <LedgerSection label="Experience" data-testid="profile-experience">
                      <ExperienceEditor draft={draft} commit={commit} />
                    </LedgerSection>

                    <LedgerSection id="profile-projects" label="Projects" hint="The strongest signal for internships." data-testid="profile-projects">
                      <ProjectsEditor
                        draft={draft}
                        commit={commit}
                        onAddRef={(el) => {
                          projectAdd.current = el;
                        }}
                      />
                    </LedgerSection>

                    <LedgerSection id="profile-links" label="Links" data-testid="profile-links">
                      <LinksEditor draft={draft} commit={commit} />
                    </LedgerSection>

                    <LedgerSection id="profile-preferences" label="Preferences" hint="What reaches your radar. Private.">
                      <PreferencesSummary draft={draft} onEdit={openPrefs} />
                    </LedgerSection>

                    <LedgerSection id="profile-resume-section" label="Resume">
                      <ResumeRow resume={profile.data?.resume ?? null} draft={draft} />
                    </LedgerSection>
                  </m.div>
                ) : (
                  <m.div
                    key="preview"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: tweens.fadeIn }}
                    exit={{ opacity: 0, transition: tweens.fadeOut }}
                  >
                    <RecruiterPreview draft={draft} name={name} email={email} />
                  </m.div>
                )}
              </AnimatePresence>
            )}
          </div>

          <aside aria-label="Profile strength" className={cn('hidden xl:block', !score && 'xl:hidden')}>
            {score && (
              <div className="sticky top-[calc(var(--topbar-h)+1.5rem)] flex flex-col gap-4 rounded-lg border border-border bg-surface-raised p-4">
                <CompletenessMeter percent={score.percent} items={score.items} next={score.next} onGo={go} />
                <p className="text-caption text-fg-tertiary">
                  Every edit saves as you go and re-ranks your radar within a minute.
                </p>
              </div>
            )}
          </aside>
        </div>
      </div>

      {draft && (
        <PreferencesPanel
          draft={draft}
          open={prefs.open}
          session={prefs.session}
          onOpenChange={(open) => setPrefs((p) => ({ ...p, open }))}
          commit={commit}
        />
      )}
    </div>
  );
}

