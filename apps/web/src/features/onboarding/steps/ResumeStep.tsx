/* eslint-disable react-refresh/only-export-components -- Co-located public hook/context API. */
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, FileText, PenLine, RotateCw, ShieldCheck } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useCallback } from 'react';

import type { ResumeUploadResponse } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Question } from '@/features/onboarding/components/Question';
import { ResumeDropzone } from '@/features/onboarding/components/ResumeDropzone';
import { latestDraft, useOnboarding } from '@/features/onboarding/flow/context';
import {
  cancelResumeUpload,
  resetResumeUpload,
  startResumeUpload,
  useResumeUpload,
} from '@/features/onboarding/flow/resume-upload';
import { inlineReveal } from '@/features/onboarding/lib/motion';
import { describeIssue, formatBytes } from '@/features/onboarding/lib/resume-file';
import {
  isPlaceholder,
  primaryEducation,
  suggestRoles,
  toDraft,
} from '@/features/profile/lib/profile-model';

/**
 * After the parse: the student's own education answer wins over the parser (the parser may have
 * read an older degree), and roles are suggested from the skills when the resume named none.
 */
export function useAfterParse() {
  const qc = useQueryClient();
  const flow = useOnboarding();
  return useCallback(
    async (result: ResumeUploadResponse) => {
      const parsed = toDraft(result.profile);
      const before = flow.draft;
      const mine =
        before.education.length > 0 && flow.answers.answered?.includes('education')
          ? primaryEducation(before)
          : null;
      const patch: Record<string, unknown> = {};
      if (mine) {
        const fromResume = primaryEducation(parsed);
        patch.education = [
          {
            ...mine,
            institution:
              fromResume && isPlaceholder(mine.institution)
                ? fromResume.institution
                : mine.institution,
          },
          ...parsed.education.filter((e) => e.gradYear !== mine.gradYear),
        ];
      }
      const current = latestDraft(qc);
      if (current && current.preferredRoles.length === 0) {
        const roles = suggestRoles(parsed.skills);
        if (roles.length > 0) patch.preferredRoles = roles;
      }
      if (Object.keys(patch).length > 0) await flow.patchProfile(patch).catch(() => undefined);
    },
    [flow, qc],
  );
}

/** Step 4: "Got a resume handy?" Drop, click or paste; the reading state lives on the next page. */
export function ResumeStep() {
  const qc = useQueryClient();
  const flow = useOnboarding();
  const upload = useResumeUpload();
  const afterParse = useAfterParse();
  const onFile = useCallback(
    (file: File) => {
      const accepted = startResumeUpload(file, { qc, onParsed: afterParse });
      if (accepted) flow.complete('resume', { answers: { resumeParsed: true } });
    },
    [afterParse, flow, qc],
  );
  const onFileStored = flow.profile.resume;
  const issue = upload.phase === 'failed' ? upload.issue : null;
  const copy = issue ? describeIssue(issue) : null;
  const pick = () =>
    document.querySelector<HTMLInputElement>('[data-testid="resume-file-input"]')?.click();
  const skipToQuestions = () => {
    resetResumeUpload();
    flow.complete('resume', { how: 'skipped', answers: { resumeParsed: false } });
  };
  const aiOn =
    flow.me.onboarding.consent?.aiMode !== 'off' && Boolean(flow.me.onboarding.consent?.resumeToAi);

  return (
    <Question
      step="resume"
      prompt="Let’s start with your resume."
      helper="We read it once to learn your skills, education and graduation year."
      primary={
        onFileStored
          ? {
              label: 'Use this resume',
              onClick: () => flow.complete('resume', { answers: { resumeParsed: true } }),
            }
          : { disabled: true, hint: 'Drop a file, or skip.', onClick: () => undefined }
      }
      skip={{
        label: 'Skip — fit scores will be rougher until you add one',
        onSkip: skipToQuestions,
      }}
      footnote={
        <span className="inline-flex items-start gap-1.5">
          <ShieldCheck
            className="mt-0.5 size-4 shrink-0 text-fg-tertiary"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          {aiOn
            ? 'Read on Beacon’s servers; Beacon AI may tidy the result, as you agreed. Never shared.'
            : 'Read on Beacon’s servers by our parser, without AI. Never shared.'}
        </span>
      }
    >
      <ResumeDropzone
        phase={upload.phase === 'done' ? 'idle' : upload.phase}
        file={upload.file}
        progress={upload.progress}
        onFile={onFile}
        onRetry={pick}
        onCancel={cancelResumeUpload}
      />

      {onFileStored && upload.phase !== 'failed' && (
        <p
          className="flex items-center gap-2 text-small text-fg-secondary"
          data-testid="onboarding-resume-on-file"
        >
          <FileText className="size-4 text-fg-tertiary" strokeWidth={1.5} aria-hidden="true" />
          On file: <span className="font-medium text-fg">{onFileStored.fileName}</span>
          <span className="font-mono text-mono-sm text-fg-tertiary">
            {formatBytes(onFileStored.size)}
          </span>
        </p>
      )}

      <AnimatePresence initial={false} mode="wait">
        {copy && issue && (
          <m.div
            key={issue.kind}
            {...inlineReveal}
            role="alert"
            data-testid="resume-error"
            data-kind={issue.kind}
            className="flex flex-col gap-3 rounded-xl border border-danger/30 bg-danger-subtle p-4 sm:flex-row sm:items-start"
          >
            <AlertCircle
              className="mt-0.5 size-5 shrink-0 text-danger"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-body font-medium text-fg">{copy.title}</p>
              <p className="text-small text-fg-secondary">{copy.body}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {copy.actions.map((action) =>
                  action === 'manual' ? (
                    <Button
                      key={action}
                      variant="secondary"
                      size="sm"
                      onClick={skipToQuestions}
                      data-testid="resume-error-manual"
                    >
                      <PenLine className="size-4" strokeWidth={1.5} aria-hidden="true" />
                      Fill in manually
                    </Button>
                  ) : action === 'retry' ? (
                    <Button key={action} variant="ghost" size="sm" onClick={pick}>
                      <RotateCw className="size-4" strokeWidth={1.5} aria-hidden="true" />
                      Try again
                    </Button>
                  ) : (
                    <Button key={action} variant="ghost" size="sm" onClick={pick}>
                      <FileText className="size-4" strokeWidth={1.5} aria-hidden="true" />
                      {action === 'docx' ? 'Try a DOCX' : 'Choose another file'}
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
          onClick={skipToQuestions}
          data-testid="onboarding-manual-link"
          className="rounded-xs font-medium text-accent-strong underline-offset-3 hover:underline focus-visible:focus-ring"
        >
          Answer 3 quick questions instead
        </button>
      </p>
    </Question>
  );
}
