import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, FileText, Loader2, Upload } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useRef, useState } from 'react';

import { queryKeys } from '@/api';
import { uploadResumeWithProgress, usePatchProfileOptimistic } from '@/api/profile';
import type { ResumeMeta } from '@/api/types';
import { Button } from '@/components/ui/button';
import { inlineReveal, springs } from '@/features/onboarding/lib/motion';
import {
  describeIssue,
  formatBytes,
  issueFromResponse,
  RESUME_ACCEPT,
  validateResumeFile,
  type ResumeIssue,
} from '@/features/onboarding/lib/resume-file';
import { resumePatch, toDraft, type ProfileDraft } from '@/features/profile/lib/profile-model';
import { isApiError } from '@/lib/api';
import { withUndo } from '@/lib/undo';
import { formatShortDate } from '@kestrel/ui';

/**
 * The resume on file, with [Re-upload]. A new file is parsed and merged into the profile at once
 * (optimistic: the page updates as soon as the parse lands), and the toast can undo the merge.
 */
export function ResumeRow({ resume, draft }: { resume: ResumeMeta | null; draft: ProfileDraft }) {
  const qc = useQueryClient();
  const restore = usePatchProfileOptimistic();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [issue, setIssue] = useState<ResumeIssue | null>(null);

  async function upload(file: File) {
    const invalid = validateResumeFile(file);
    setIssue(invalid);
    if (invalid) return;
    const before = draft;
    setProgress(0);
    try {
      const result = await uploadResumeWithProgress(file, { save: true, onProgress: setProgress });
      const parsed = toDraft(result.profile);
      // Show the merged result straight away; the refetch below confirms it.
      qc.setQueryData(queryKeys.profile, (current: { profile: object } | undefined) =>
        current ? { ...current, exists: true, profile: { ...current.profile, ...resumePatch(parsed) } } : current,
      );
      void qc.invalidateQueries({ queryKey: queryKeys.profile });
      void qc.invalidateQueries({ queryKey: queryKeys.me });
      withUndo({
        message: `Profile updated from ${file.name}.`,
        run: () => undefined,
        undo: () => restore.mutateAsync(resumePatch(before)),
      });
    } catch (error) {
      if (isApiError(error) && error.code === 'ABORTED') return;
      setIssue(isApiError(error) ? issueFromResponse(error.status, error.code, file, error.retryAfterSeconds) : { kind: 'unknown' });
    } finally {
      setProgress(null);
    }
  }

  const copy = issue ? describeIssue(issue) : null;
  const busy = progress !== null;

  return (
    <div className="flex flex-col gap-3" data-testid="profile-resume">
      <input
        ref={input}
        type="file"
        accept={RESUME_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="profile-resume-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void upload(file);
        }}
      />
      <div className="relative flex items-center gap-3 overflow-hidden rounded-md border border-border bg-surface-raised px-3 py-2.5">
        <FileText className="size-5 shrink-0 text-fg-secondary" strokeWidth={1.5} aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-col">
          {resume ? (
            <>
              <span className="truncate text-body font-medium text-fg" title={resume.fileName}>
                {resume.fileName}
              </span>
              <span className="font-mono text-mono-sm text-fg-tertiary">
                {formatBytes(resume.size)} · read {formatShortDate(resume.uploadedAt)}
                {resume.parsedFrom === 'llm' ? ' · refined with AI' : ''}
              </span>
            </>
          ) : (
            <>
              <span className="text-body text-fg">No resume on file</span>
              <span className="text-small text-fg-tertiary">PDF or DOCX up to 5 MB. Skills and education are read in seconds.</span>
            </>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          aria-busy={busy || undefined}
          onClick={() => input.current?.click()}
          data-testid="profile-resume-upload"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <Upload className="size-4" strokeWidth={1.5} aria-hidden="true" />
          )}
          {busy ? (progress >= 1 ? 'Reading…' : `${Math.round(progress * 100)}%`) : resume ? 'Re-upload' : 'Upload resume'}
        </Button>
        {busy && (
          <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-surface-sunken">
            <m.span
              className="block h-full origin-left bg-accent-strong"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: Math.max(0.04, progress) }}
              transition={springs.data}
            />
          </span>
        )}
      </div>
      <AnimatePresence initial={false}>
        {copy && (
          <m.div key={issue?.kind} {...inlineReveal} role="alert" className="flex items-start gap-2 text-small" data-testid="profile-resume-error">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" strokeWidth={1.5} aria-hidden="true" />
            <span>
              <span className="font-medium text-fg">{copy.title}.</span> <span className="text-fg-secondary">{copy.body}</span>
            </span>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
