import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, FileText, PenLine, RotateCw } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { queryKeys, useMe, useProfile, useUpdateMe, useUpdateProfile } from '@/api';
import { uploadResumeWithProgress } from '@/api/profile';
import { Button } from '@/components/ui/button';
import { ManualProfileForm } from '@/features/onboarding/components/ManualProfileForm';
import { ParsedPreview, type PreviewStatus } from '@/features/onboarding/components/ParsedPreview';
import { ResumeDropzone, type DropzonePhase } from '@/features/onboarding/components/ResumeDropzone';
import { StepIntro } from '@/features/onboarding/components/StepIntro';
import { inlineReveal, tweens } from '@/features/onboarding/lib/motion';
import {
  describeIssue,
  issueFromResponse,
  validateResumeFile,
  type ResumeIssue,
} from '@/features/onboarding/lib/resume-file';
import { validateResumeStep, type StepErrors } from '@/features/onboarding/lib/resume-step';
import { useStepActions } from '@/features/onboarding/lib/step-actions';
import {
  EMPTY_DRAFT,
  resumePatch,
  suggestRoles,
  toDraft,
  type ProfileDraft,
} from '@/features/profile/lib/profile-model';
import { isApiError } from '@/lib/api';
import { cn } from '@kestrel/ui';

export interface ResumeStepProps {
  onDone: () => void;
}

/**
 * Step 1 — Resume. Drop/click/paste a PDF or DOCX, watch it upload, then edit the parsed preview in
 * place. Scanned PDFs, wrong types and oversized files explain themselves and offer the manual form.
 */
export function ResumeStep({ onDone }: ResumeStepProps) {
  const qc = useQueryClient();
  const me = useMe();
  const profile = useProfile();
  const updateProfile = useUpdateProfile();
  const updateMe = useUpdateMe();

  const [mode, setMode] = useState<'upload' | 'manual'>('upload');
  const [phase, setPhase] = useState<DropzonePhase>('idle');
  const [file, setFile] = useState<{ name: string; size: number; blob?: File } | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [progress, setProgress] = useState(0);
  const [issue, setIssue] = useState<ResumeIssue | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>(EMPTY_DRAFT);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [refined, setRefined] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const gradYearRef = useRef<HTMLSelectElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Resuming onboarding: start from the stored profile once it arrives (derived state, set in render).
  if (!seeded && profile.data) {
    setSeeded(true);
    if (profile.data.exists) {
      setDraft(toDraft(profile.data.profile));
      const resume = profile.data.resume;
      if (resume) {
        setPhase('done');
        setFile({ name: resume.fileName, size: resume.size });
      }
    }
  }

  useEffect(() => () => abort.current?.abort(), []);

  // Errors show once the user has tried to continue, and clear live as they are fixed.
  const errors: StepErrors = attempted ? validateResumeStep(draft) : {};

  const onFile = useCallback(async (picked: File) => {
    abort.current?.abort();
    setFile({ name: picked.name, size: picked.size, blob: picked });
    setIssue(null);
    setSaveError(false);
    setWarnings([]);
    setRefined(false);
    const invalid = validateResumeFile(picked);
    if (invalid) {
      setIssue(invalid);
      setPhase('failed');
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setPhase('uploading');
    setProgress(0);
    try {
      const result = await uploadResumeWithProgress(picked, {
        save: true,
        signal: controller.signal,
        onProgress: (fraction) => {
          setProgress(fraction);
          if (fraction >= 1) setPhase('reading');
        },
      });
      const parsed = toDraft(result.profile);
      setDraft(parsed.preferredRoles.length > 0 ? parsed : { ...parsed, preferredRoles: suggestRoles(parsed.skills) });
      setWarnings(result.warnings ?? []);
      setRefined(result.parsedFrom === 'llm');
      setPhase('done');
      setMode('upload');
      void qc.invalidateQueries({ queryKey: queryKeys.profile });
      void qc.invalidateQueries({ queryKey: queryKeys.me });
    } catch (error) {
      if (isApiError(error) && error.code === 'ABORTED') {
        setPhase('idle');
        setFile(null);
        return;
      }
      setIssue(
        isApiError(error)
          ? issueFromResponse(error.status, error.code, picked, error.retryAfterSeconds)
          : { kind: 'unknown' },
      );
      setPhase('failed');
    }
  }, [qc]);

  const openManual = useCallback(() => {
    setMode('manual');
    setIssue(null);
    requestAnimationFrame(() => gradYearRef.current?.focus());
  }, []);

  async function saveStep(next: 'preferences') {
    await updateMe.mutateAsync({ onboardingStep: next });
  }

  useStepActions('resume', {
    onContinue: async () => {
      setAttempted(true);
      const found = validateResumeStep(draft);
      if (found.gradYear || found.skills) {
        if (found.gradYear) gradYearRef.current?.focus();
        else document.querySelector<HTMLInputElement>('[data-testid="resume-skill-input"]')?.focus();
        return;
      }
      setSaveError(false);
      try {
        await updateProfile.mutateAsync(resumePatch(draft));
        await saveStep('preferences');
        onDone();
      } catch {
        setSaveError(true);
      }
    },
    pending: updateProfile.isPending || updateMe.isPending,
    onSkip: async () => {
      abort.current?.abort();
      try {
        await saveStep('preferences');
      } finally {
        onDone();
      }
    },
  });

  const copy = issue ? describeIssue(issue) : null;
  const previewStatus: PreviewStatus =
    mode === 'manual' ? 'ready' : phase === 'done' ? 'ready' : phase === 'uploading' || phase === 'reading' ? 'reading' : 'idle';
  const showPreview = previewStatus !== 'idle';
  const name = me.data?.user.name ?? null;
  const email = me.data?.user.email ?? null;

  return (
    <div className="grid gap-8 pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-12 lg:pt-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
      <div className="flex min-w-0 flex-col gap-6">
        <StepIntro
          ref={headingRef}
          title="Start with your resume"
          why="We read it once to learn your skills, education and graduation year. You can edit everything."
        />

        <AnimatePresence initial={false} mode="popLayout">
          {mode === 'upload' ? (
            <m.div
              key="upload"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: tweens.fadeIn }}
              exit={{ opacity: 0, transition: tweens.fadeOut }}
              className="flex flex-col gap-4"
            >
              <ResumeDropzone
                phase={phase}
                file={file}
                progress={progress}
                onFile={(f) => void onFile(f)}
                onRetry={() => file?.blob && void onFile(file.blob)}
                onCancel={() => abort.current?.abort()}
              />

              <AnimatePresence initial={false}>
                {copy && (
                  <m.div
                    key={issue?.kind}
                    {...inlineReveal}
                    role="alert"
                    data-testid="resume-error"
                    data-kind={issue?.kind}
                    className="flex flex-col gap-3 rounded-md border border-danger/40 bg-danger-subtle p-3 sm:flex-row sm:items-start"
                  >
                    <AlertCircle className="mt-0.5 size-5 shrink-0 text-danger" strokeWidth={1.5} aria-hidden="true" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className="text-body font-medium text-fg">{copy.title}</p>
                      <p className="text-small text-fg-secondary">{copy.body}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {copy.actions.map((action) =>
                          action === 'manual' ? (
                            <Button key={action} variant="secondary" size="sm" onClick={openManual} data-testid="resume-error-manual">
                              <PenLine className="size-4" strokeWidth={1.5} aria-hidden="true" />
                              Fill in manually
                            </Button>
                          ) : action === 'docx' ? (
                            <Button
                              key={action}
                              variant="ghost"
                              size="sm"
                              onClick={() => document.querySelector<HTMLInputElement>('[data-testid="resume-file-input"]')?.click()}
                            >
                              <FileText className="size-4" strokeWidth={1.5} aria-hidden="true" />
                              Try a DOCX
                            </Button>
                          ) : action === 'retry' ? (
                            <Button key={action} variant="ghost" size="sm" onClick={() => file?.blob && void onFile(file.blob)}>
                              <RotateCw className="size-4" strokeWidth={1.5} aria-hidden="true" />
                              Try again
                            </Button>
                          ) : (
                            <Button
                              key={action}
                              variant="ghost"
                              size="sm"
                              onClick={() => document.querySelector<HTMLInputElement>('[data-testid="resume-file-input"]')?.click()}
                            >
                              Choose another file
                            </Button>
                          ),
                        )}
                      </div>
                    </div>
                  </m.div>
                )}
              </AnimatePresence>

              <p className="text-small text-fg-tertiary">
                No resume handy?{' '}
                <button
                  type="button"
                  onClick={openManual}
                  data-testid="onboarding-manual-link"
                  className="rounded-xs font-medium text-accent-strong underline-offset-3 hover:underline focus-visible:focus-ring"
                >
                  Fill it in manually instead
                </button>
              </p>
            </m.div>
          ) : (
            <m.div
              key="manual"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: tweens.fadeIn }}
              exit={{ opacity: 0, transition: tweens.fadeOut }}
              className="flex flex-col gap-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-h2 text-fg">The essentials</h2>
                <Button variant="ghost" size="sm" onClick={() => setMode('upload')} data-testid="onboarding-upload-instead">
                  Upload a resume instead
                </Button>
              </div>
              <ManualProfileForm draft={draft} onChange={setDraft} errors={errors} gradYearRef={gradYearRef} />
            </m.div>
          )}
        </AnimatePresence>

        {saveError && (
          <p role="alert" className="flex items-center gap-1.5 text-small text-danger">
            <AlertCircle className="size-4" strokeWidth={1.5} aria-hidden="true" />
            Couldn’t save your profile. Check your connection and press Continue again.
          </p>
        )}
      </div>

      <aside
        aria-label="Parsed profile"
        className={cn('min-w-0 lg:sticky lg:top-6 lg:self-start', (!showPreview || mode === 'manual') && 'max-lg:hidden')}
      >
        <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
          {showPreview ? (
            <ParsedPreview
              draft={draft}
              onChange={setDraft}
              status={previewStatus}
              name={name}
              email={email}
              warnings={warnings}
              refinedWithAi={refined}
              errors={mode === 'upload' ? errors : {}}
              gradYearRef={mode === 'upload' ? gradYearRef : undefined}
              readOnly={mode === 'manual'}
            />
          ) : (
            <div className="flex flex-col gap-2 py-6 text-center" data-testid="resume-preview-empty">
              <p className="text-body font-medium text-fg">Your profile appears here</p>
              <p className="text-small text-fg-tertiary">
                Skills, education and links, read from your resume in a few seconds.
              </p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
