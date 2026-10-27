/**
 * The resume upload, kept outside React so it survives the page change from "Got a resume handy?" to
 * "Here's what we found" (the parsing shimmer lives on the second page and resolves into content).
 */
import type { QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import { queryKeys } from '@/api/keys';
import { uploadResumeWithProgress } from '@/api/profile';
import type { ProfileResponse, ResumeUploadResponse } from '@/api/types';
import {
  issueFromResponse,
  validateResumeFile,
  type ResumeIssue,
} from '@/features/onboarding/lib/resume-file';
import { isApiError } from '@/lib/api';

export type UploadPhase = 'idle' | 'uploading' | 'reading' | 'done' | 'failed';

export interface UploadState {
  phase: UploadPhase;
  file: { name: string; size: number } | null;
  progress: number;
  issue: ResumeIssue | null;
  result: ResumeUploadResponse | null;
}

const IDLE: UploadState = { phase: 'idle', file: null, progress: 0, issue: null, result: null };

let state: UploadState = IDLE;
let blob: File | null = null;
let controller: AbortController | null = null;
const listeners = new Set<() => void>();

function set(next: Partial<UploadState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export function useResumeUpload(): UploadState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => IDLE,
  );
}

export function getResumeUpload(): UploadState {
  return state;
}

export function resetResumeUpload(): void {
  controller?.abort();
  controller = null;
  blob = null;
  set(IDLE);
}

export function cancelResumeUpload(): void {
  controller?.abort();
}

export interface StartUploadOptions {
  qc: QueryClient;
  /** Called with the parse result once the server has read (and stored) it. */
  onParsed?: (result: ResumeUploadResponse) => void | Promise<void>;
}

/**
 * Validates locally (type, 5 MB) before any bytes leave, then uploads with progress and `?save=true`
 * (so the parse and the file record survive a closed tab). Returns false when the file was rejected
 * locally (the caller stays on the dropzone and shows the issue).
 */
export function startResumeUpload(file: File, { qc, onParsed }: StartUploadOptions): boolean {
  controller?.abort();
  blob = file;
  const invalid = validateResumeFile(file);
  if (invalid) {
    set({
      phase: 'failed',
      file: { name: file.name, size: file.size },
      progress: 0,
      issue: invalid,
      result: null,
    });
    return false;
  }
  const own = new AbortController();
  controller = own;
  set({
    phase: 'uploading',
    file: { name: file.name, size: file.size },
    progress: 0,
    issue: null,
    result: null,
  });
  void uploadResumeWithProgress(file, {
    save: true,
    signal: own.signal,
    onProgress: (fraction) => {
      if (controller !== own) return;
      set(fraction >= 1 ? { phase: 'reading', progress: 1 } : { progress: fraction });
    },
  })
    .then(async (result) => {
      if (controller !== own) return;
      // Show the parse at once: the stored profile now holds it (save=true merged it server-side).
      qc.setQueryData<ProfileResponse>(queryKeys.profile, (prev) =>
        prev
          ? {
              ...prev,
              exists: true,
              profile: { ...prev.profile, ...result.profile } as ProfileResponse['profile'],
              resume: {
                fileName: file.name,
                mimeType: file.type || 'application/pdf',
                size: file.size,
                textChars: result.textChars,
                uploadedAt: new Date(),
                parsedFrom: result.parsedFrom,
              },
            }
          : prev,
      );
      await onParsed?.(result);
      set({ phase: 'done', result, progress: 1 });
      void qc.invalidateQueries({ queryKey: queryKeys.me });
    })
    .catch((error: unknown) => {
      if (controller !== own) return;
      if (isApiError(error) && error.code === 'ABORTED') {
        set(IDLE);
        return;
      }
      set({
        phase: 'failed',
        issue: isApiError(error)
          ? issueFromResponse(error.status, error.code, file, error.retryAfterSeconds)
          : { kind: 'unknown' },
      });
    });
  return true;
}

/** Retry the last file (after a network or server failure). */
export function retryResumeUpload(options: StartUploadOptions): boolean {
  return blob ? startResumeUpload(blob, options) : false;
}
