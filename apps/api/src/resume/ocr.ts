/**
 * OCR fallback for scanned resumes. Image-only PDFs are rendered page by page (unpdf's pdf.js
 * build + `@napi-rs/canvas`, at most `OCR_MAX_PAGES` pages at `OCR_DPI`), PNG/JPEG uploads are
 * read directly, and both go through tesseract.js. The English LSTM model ships in
 * `@tesseract.js-data/eng`, so nothing is downloaded at runtime and nothing is cached to disk.
 *
 * One tesseract worker is created lazily and reused. Jobs run one at a time; each call gets a
 * budget of `OCR_TIMEOUT_MS` measured from the call (time spent waiting behind another upload
 * counts). A timed-out worker is terminated and recreated on the next call, and an idle worker
 * is terminated after 5 minutes so its memory goes back to the box.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { createWorker, OEM, type Worker } from 'tesseract.js';
import { createIsomorphicCanvasFactory, getDocumentProxy, renderPageAsImage } from 'unpdf';

export const OCR_MAX_PAGES = 4;
export const OCR_DPI = 150;
export const OCR_TIMEOUT_MS = 60_000;
/** Longest side of a rendered page or an uploaded image handed to tesseract. */
export const OCR_MAX_SIDE_PX = 4_000;
/** Images above this many pixels are refused before decoding (decompression bombs). */
export const OCR_MAX_PIXELS = 40_000_000;
const IDLE_TERMINATE_MS = 5 * 60_000;

export type ImageKind = 'png' | 'jpeg';

export class OcrError extends Error {
  readonly reason: 'timeout' | 'too_large' | 'failed';

  constructor(message: string, reason: OcrError['reason']) {
    super(message);
    this.name = 'OcrError';
    this.reason = reason;
  }
}

export interface OcrResult {
  text: string;
  pages: number;
  /** Mean tesseract confidence, 0..100. */
  confidence: number;
}

const canvasImport = () => import('@napi-rs/canvas');

/** `@tesseract.js-data/eng/4.0.0_best_int` (LSTM integer model, ~3 MB gzipped). */
function langPath(): string {
  const require = createRequire(import.meta.url);
  return join(dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int');
}

// ── Image helpers ──────────────────────────────────────────────────────────────

/** Width and height from the PNG IHDR chunk or the first JPEG SOF marker; null when unreadable. */
export function imageSize(buffer: Buffer, kind: ImageKind): { width: number; height: number } | null {
  if (kind === 'png') {
    if (buffer.length < 24 || buffer.toString('latin1', 12, 16) !== 'IHDR') return null;
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  let i = 2;
  while (i + 9 < buffer.length) {
    if (buffer[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buffer[i + 1]!;
    // SOF0..SOF15 carry the frame size; C4 (DHT), C8 (JPG) and CC (DAC) are not frames.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buffer.readUInt16BE(i + 5), width: buffer.readUInt16BE(i + 7) };
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) {
      i += marker === 0xff ? 1 : 2;
      continue;
    }
    i += 2 + buffer.readUInt16BE(i + 2);
  }
  return null;
}

/** Refuse oversized images and scale large ones down to `OCR_MAX_SIDE_PX` (PNG out). */
export async function prepareImage(buffer: Buffer, kind: ImageKind): Promise<Buffer> {
  const size = imageSize(buffer, kind);
  if (!size || size.width < 1 || size.height < 1) throw new OcrError('The image could not be read', 'failed');
  if (size.width * size.height > OCR_MAX_PIXELS) {
    throw new OcrError(`The image is too large to read (${size.width} × ${size.height} px)`, 'too_large');
  }
  const longest = Math.max(size.width, size.height);
  if (longest <= OCR_MAX_SIDE_PX) return buffer;
  const { createCanvas, loadImage } = await canvasImport();
  const image = await loadImage(buffer);
  const scale = OCR_MAX_SIDE_PX / longest;
  const canvas = createCanvas(Math.round(size.width * scale), Math.round(size.height * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.encode('png');
}

/** Render the first `maxPages` pages of a PDF to PNG at `dpi` (capped at `OCR_MAX_SIDE_PX`). */
export async function renderPdfPages(buffer: Buffer, maxPages = OCR_MAX_PAGES, dpi = OCR_DPI): Promise<Buffer[]> {
  const CanvasFactory = await createIsomorphicCanvasFactory(canvasImport);
  // `new Uint8Array(buffer)` copies: pdf.js may detach the bytes it is given.
  const pdf = await getDocumentProxy(new Uint8Array(buffer), { CanvasFactory });
  try {
    const pages: Buffer[] = [];
    for (let n = 1; n <= Math.min(pdf.numPages, maxPages); n += 1) {
      const page = await pdf.getPage(n);
      const { width, height } = page.getViewport({ scale: 1 });
      const scale = Math.min(dpi / 72, OCR_MAX_SIDE_PX / Math.max(width, height, 1));
      pages.push(Buffer.from(await renderPageAsImage(pdf, n, { canvasImport, scale })));
    }
    return pages;
  } finally {
    await pdf.loadingTask.destroy();
  }
}

// ── Tesseract worker ───────────────────────────────────────────────────────────

let worker: Promise<Worker> | null = null;
let idleTimer: NodeJS.Timeout | null = null;
let tail: Promise<unknown> = Promise.resolve();

function getWorker(): Promise<Worker> {
  worker ??= createWorker('eng', OEM.LSTM_ONLY, { langPath: langPath(), gzip: true, cacheMethod: 'none' }).catch(
    (err: unknown) => {
      worker = null;
      throw new OcrError(`OCR engine failed to start: ${(err as Error).message ?? String(err)}`, 'failed');
    },
  );
  return worker;
}

/** Terminate the shared worker (idle timeout, a timed-out job, or process shutdown). */
export async function shutdownOcr(): Promise<void> {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  const current = worker;
  worker = null;
  if (current) await current.then((w) => w.terminate()).catch(() => undefined);
}

function scheduleIdleShutdown(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => void shutdownOcr(), IDLE_TERMINATE_MS);
  idleTimer.unref();
}

function beforeDeadline<T>(promise: Promise<T>, deadline: number): Promise<T> {
  const ms = deadline - Date.now();
  promise.catch(() => undefined); // the loser of the race must not become an unhandled rejection
  if (ms <= 0) return Promise.reject(new OcrError('OCR timed out', 'timeout'));
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new OcrError('OCR timed out', 'timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

/** OCR the images in order (one job at a time across the process). */
export async function recogniseImages(images: readonly Buffer[], timeoutMs = OCR_TIMEOUT_MS): Promise<OcrResult> {
  const deadline = Date.now() + timeoutMs;
  const run = async (): Promise<OcrResult> => {
    const w = await beforeDeadline(getWorker(), deadline);
    const texts: string[] = [];
    let confidence = 0;
    for (const image of images) {
      const { data } = await beforeDeadline(w.recognize(image), deadline);
      texts.push(data.text);
      confidence += data.confidence;
    }
    return { text: texts.join('\n\n').trim(), pages: images.length, confidence: images.length ? confidence / images.length : 0 };
  };
  const job = tail.then(run, run);
  tail = job.catch(() => undefined);
  try {
    return await job;
  } catch (err) {
    if (err instanceof OcrError && err.reason === 'timeout') await shutdownOcr();
    if (err instanceof OcrError) throw err;
    throw new OcrError(`OCR failed: ${(err as Error).message}`, 'failed');
  } finally {
    if (worker) scheduleIdleShutdown();
  }
}

/** Scanned PDF → rendered pages → text. */
export async function ocrPdf(buffer: Buffer, timeoutMs = OCR_TIMEOUT_MS): Promise<OcrResult> {
  const deadline = Date.now() + timeoutMs;
  let pages: Buffer[];
  try {
    pages = await beforeDeadline(renderPdfPages(buffer), deadline);
  } catch (err) {
    if (err instanceof OcrError) throw err;
    throw new OcrError(`Could not render the PDF pages: ${(err as Error).message}`, 'failed');
  }
  return recogniseImages(pages, Math.max(0, deadline - Date.now()));
}

/** PNG/JPEG upload → text. */
export async function ocrImage(buffer: Buffer, kind: ImageKind, timeoutMs = OCR_TIMEOUT_MS): Promise<OcrResult> {
  return recogniseImages([await prepareImage(buffer, kind)], timeoutMs);
}
