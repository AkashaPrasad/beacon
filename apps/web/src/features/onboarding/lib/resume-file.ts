/**
 * Resume upload rules. The UI accepts PDF or DOCX up to 5 MB (USERFLOW §1.4, DESIGN §6.1); the API
 * accepts up to 10 MB (shared `LIMITS.resumeMaxBytes`, API.md §4) and answers 413 above that. Magic
 * bytes are checked server-side too.
 */
export const RESUME_MAX_BYTES = 5 * 1024 * 1024;
export const RESUME_ACCEPT =
  '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export type ResumeIssue =
  | { kind: 'no-text' }
  | { kind: 'unreadable' }
  | { kind: 'too-large'; size: number }
  | { kind: 'wrong-type'; label: string }
  | { kind: 'rate-limited'; retryAfterSeconds: number | null }
  | { kind: 'network' }
  | { kind: 'unknown'; message?: string };

/** "20 MB", "740 KB" (1 decimal under 10 MB). */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${mb >= 10 ? Math.round(mb) : Number(mb.toFixed(1))} MB`;
  }
  if (bytes >= 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${bytes} B`;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** Human label for a file's type: ".exe", ".png", or "file without an extension". */
export function fileTypeLabel(file: Pick<File, 'name' | 'type'>): string {
  const ext = extensionOf(file.name);
  if (ext) return `.${ext}`;
  if (file.type) return file.type;
  return 'file without an extension';
}

export function isAcceptedResume(file: Pick<File, 'name' | 'type'>): boolean {
  const ext = extensionOf(file.name);
  if (ext === 'pdf' || ext === 'docx') return true;
  return file.type === PDF_MIME || file.type === DOCX_MIME;
}

/** Client-side pre-check so wrong files fail instantly, before any bytes are sent. */
export function validateResumeFile(file: Pick<File, 'name' | 'type' | 'size'>): ResumeIssue | null {
  if (!isAcceptedResume(file)) return { kind: 'wrong-type', label: fileTypeLabel(file) };
  if (file.size > RESUME_MAX_BYTES) return { kind: 'too-large', size: file.size };
  return null;
}

/** Maps an upload failure (HTTP status + API error code) to an issue. */
export function issueFromResponse(
  status: number,
  code: string | undefined,
  file: Pick<File, 'name' | 'type' | 'size'>,
  retryAfterSeconds: number | null = null,
): ResumeIssue {
  if (status === 0) return { kind: 'network' };
  if (status === 413 || code === 'PAYLOAD_TOO_LARGE') return { kind: 'too-large', size: file.size };
  if (status === 415 || code === 'UNSUPPORTED_MEDIA_TYPE')
    return { kind: 'wrong-type', label: fileTypeLabel(file) };
  if (code === 'RESUME_NO_TEXT') return { kind: 'no-text' };
  if (code === 'RESUME_UNREADABLE') return { kind: 'unreadable' };
  if (status === 429 || code === 'RATE_LIMITED') return { kind: 'rate-limited', retryAfterSeconds };
  return { kind: 'unknown' };
}

export interface IssueCopy {
  title: string;
  body: string;
  /** Which recovery actions to offer, in order. */
  actions: readonly ('manual' | 'docx' | 'retry' | 'choose')[];
}

const LIMIT_LINE = `Beacon reads PDF or DOCX up to ${formatBytes(RESUME_MAX_BYTES)}.`;

/** Final copy (USERFLOW §1.4 errors; DESIGN §8 voice: what failed, why, the fix). */
export function describeIssue(issue: ResumeIssue): IssueCopy {
  switch (issue.kind) {
    case 'no-text':
      return {
        title: 'This PDF looks like an image',
        body: "We couldn't read its text. Fill in the essentials instead — it takes about a minute.",
        actions: ['manual', 'docx'],
      };
    case 'unreadable':
      return {
        title: "We couldn't open this file",
        body: 'It may be encrypted or damaged. Export it again, or fill in the essentials instead.',
        actions: ['manual', 'choose'],
      };
    case 'too-large':
      return {
        title: `That file is ${formatBytes(issue.size)}`,
        body: LIMIT_LINE,
        actions: ['choose', 'manual'],
      };
    case 'wrong-type':
      return {
        title: `That file is a ${issue.label}`,
        body: LIMIT_LINE,
        actions: ['choose', 'manual'],
      };
    case 'rate-limited':
      return {
        title: 'Too many uploads in a minute',
        body:
          issue.retryAfterSeconds != null
            ? `Try again in ${issue.retryAfterSeconds} s.`
            : 'Wait a moment, then try again.',
        actions: ['retry', 'manual'],
      };
    case 'network':
      return {
        title: "Upload didn't finish",
        body: 'Check your connection and try again.',
        actions: ['retry', 'manual'],
      };
    case 'unknown':
      return {
        title: "We couldn't read this resume",
        body: 'Try again, or fill in the essentials instead.',
        actions: ['retry', 'manual'],
      };
  }
}
