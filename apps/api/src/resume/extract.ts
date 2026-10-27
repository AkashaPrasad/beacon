import mammoth from 'mammoth';
import { extractText } from 'unpdf';

import { HttpError } from '../lib/errors.js';

export type ResumeKind = 'pdf' | 'docx';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const PDF_MIME = 'application/pdf';
/** Below this many characters a PDF is treated as scanned / image-only. */
export const MIN_RESUME_CHARS = 200;

/** Identify the file by magic bytes (never trust the extension or MIME type alone). */
export function sniffResumeKind(buffer: Buffer, fileName: string, mimeType: string): ResumeKind | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
  if (isZip && (/\.docx$/i.test(fileName) || mimeType === DOCX_MIME)) return 'docx';
  return null;
}

export async function extractResumeText(buffer: Buffer, kind: ResumeKind): Promise<string> {
  try {
    if (kind === 'pdf') {
      const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
      return text;
    }
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  } catch (err) {
    throw new HttpError(
      422,
      'RESUME_UNREADABLE',
      `We couldn't read this ${kind === 'pdf' ? 'PDF' : 'Word document'}. It may be corrupt or password-protected.`,
      { cause: (err as Error).message },
    );
  }
}

/** Collapse whitespace while keeping line structure. */
export function cleanText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[  -​  　]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
