import mammoth from 'mammoth';
import { extractText } from 'unpdf';

import { HttpError } from '../lib/errors.js';

export type ResumeKind = 'pdf' | 'docx' | 'png' | 'jpeg';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const PDF_MIME = 'application/pdf';
/** Below this many characters of text layer a PDF is treated as scanned and goes to OCR. */
export const MIN_RESUME_CHARS = 200;
/** After OCR (scanned PDF or image), fewer characters than this is `422 RESUME_NO_TEXT`. */
export const MIN_OCR_CHARS = 100;

/** Identify the file by magic bytes (never trust the extension or MIME type alone). */
export function sniffResumeKind(buffer: Buffer, fileName: string, mimeType: string): ResumeKind | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
  if (isZip && (/\.docx$/i.test(fileName) || mimeType === DOCX_MIME)) return 'docx';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buffer.length >= 8 && png.every((byte, i) => buffer[i] === byte)) return 'png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  return null;
}

export const isImageKind = (kind: ResumeKind): kind is 'png' | 'jpeg' => kind === 'png' || kind === 'jpeg';

/** Characters that are not whitespace-only padding (what the thresholds count). */
export function visibleChars(text: string): number {
  return text.replace(/\s+/g, ' ').trim().length;
}

/** Text layer of a PDF or DOCX (images have none; they go straight to OCR). */
export async function extractResumeText(buffer: Buffer, kind: 'pdf' | 'docx'): Promise<string> {
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
    .replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
