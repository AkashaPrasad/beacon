import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';

import { LIMITS, profileInputSchema, profilePatchSchema } from '@kestrel/shared';

import { LLM_REASON_MESSAGES, llmForUser } from '../ai/llm.js';
import type { AppContext } from '../context.js';
import { badRequest, HttpError } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { currentUser } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { Profile, type ProfileDoc, type ResumeMeta } from '../models/profile.js';
import { User, type OnboardingAnswers, type UserDoc } from '../models/user.js';
import { enrichResume, mergeLlmResume } from '../resume/enrich.js';
import {
  extractResumeText,
  isImageKind,
  MIN_OCR_CHARS,
  MIN_RESUME_CHARS,
  sniffResumeKind,
  visibleChars,
  type ResumeKind,
} from '../resume/extract.js';
import { ocrImage, ocrPdf, OcrError, type OcrResult } from '../resume/ocr.js';
import { parseResumeText, type ParsedProfile } from '../resume/parse.js';
import {
  ONBOARDING_ANSWERS_MAX_BYTES,
  onboardingCompleteSchema,
  onboardingProgressSchema,
} from '../schemas/index.js';
import { buildMe } from '../services/me.js';
import { pickProfileFields, saveProfile, toProfileResponse } from '../services/profile.js';

const RESUME_TEXT_STORED = 50_000;
/** The whole upload (text layer, OCR, LLM enrichment) answers within this budget. */
export const RESUME_ROUTE_BUDGET_MS = 85_000;
/** LLM enrichment is skipped when less than this is left of the budget. */
const MIN_ENRICH_MS = 5_000;
export const SCAN_WARNING = 'We read this from a scan — double-check the details.';

type Extraction = 'text' | 'ocr';

const NO_TEXT_MESSAGE =
  "We couldn't find readable text in this resume, even after scanning it. Upload a sharper scan or photo, export it as a text-based PDF (or the .docx), or fill your profile in by hand.";

/**
 * Text for a resume: the PDF/DOCX text layer, or OCR for images and for PDFs whose text layer
 * is under `MIN_RESUME_CHARS` (the longer of the two wins). 422 `RESUME_NO_TEXT` when nothing
 * readable remains (< `MIN_OCR_CHARS` after OCR; < `MIN_RESUME_CHARS` for a DOCX).
 */
async function resumeText(
  ctx: AppContext,
  buffer: Buffer,
  kind: ResumeKind,
): Promise<{ text: string; extraction: Extraction; ocr: OcrResult | null }> {
  const layer = isImageKind(kind) ? '' : await extractResumeText(buffer, kind);
  if (kind === 'docx' || visibleChars(layer) >= MIN_RESUME_CHARS) {
    if (visibleChars(layer) < MIN_RESUME_CHARS) {
      throw new HttpError(422, 'RESUME_NO_TEXT', NO_TEXT_MESSAGE, { textChars: visibleChars(layer), minChars: MIN_RESUME_CHARS, ocr: false });
    }
    return { text: layer, extraction: 'text', ocr: null };
  }
  let ocr: OcrResult | null = null;
  let ocrError: OcrError['reason'] | null = null;
  try {
    ocr = isImageKind(kind) ? await ocrImage(buffer, kind) : await ocrPdf(buffer);
  } catch (err) {
    if (!(err instanceof OcrError)) throw err;
    ctx.logger.warn({ reason: err.reason, err: err.message, kind }, 'resume OCR failed');
    if (err.reason === 'too_large') {
      throw new HttpError(422, 'RESUME_UNREADABLE', `${err.message}. Upload a smaller image (under 40 megapixels) or a PDF.`);
    }
    ocrError = err.reason;
  }
  const useOcr = ocr !== null && visibleChars(ocr.text) > visibleChars(layer);
  const text = useOcr && ocr ? ocr.text : layer;
  if (visibleChars(text) < MIN_OCR_CHARS) {
    throw new HttpError(422, 'RESUME_NO_TEXT', NO_TEXT_MESSAGE, {
      textChars: visibleChars(text),
      minChars: MIN_OCR_CHARS,
      ocr: true,
      ...(ocrError ? { ocrError } : {}),
    });
  }
  return { text, extraction: useOcr ? 'ocr' : 'text', ocr };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITS.resumeMaxBytes, files: 1, fields: 5 },
});

/**
 * Atomic per-answer update: `$set` each answer, `$unset` the ones sent as `null`. The merged size
 * is checked first (413 above `ONBOARDING_ANSWERS_MAX_BYTES`).
 */
function answersUpdate(current: OnboardingAnswers | null | undefined, answers: Record<string, unknown> | undefined) {
  const set: Record<string, unknown> = {};
  const unset: Record<string, ''> = {};
  if (!answers) return { set, unset };
  const merged: Record<string, unknown> = { ...(current ?? {}) };
  for (const [key, value] of Object.entries(answers)) {
    if (value === null) {
      delete merged[key];
      unset[`onboardingAnswers.${key}`] = '';
    } else {
      merged[key] = value;
      set[`onboardingAnswers.${key}`] = value;
    }
  }
  const bytes = Buffer.byteLength(JSON.stringify(merged), 'utf8');
  if (bytes > ONBOARDING_ANSWERS_MAX_BYTES) {
    throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Onboarding answers are limited to 32 KB in total', {
      bytes,
      maxBytes: ONBOARDING_ANSWERS_MAX_BYTES,
    });
  }
  // A stored `null` map cannot take dotted paths, so replace it whole (absent is fine).
  if (current === null) return { set: { onboardingAnswers: merged }, unset: {} };
  return { set, unset };
}

async function updateOnboarding(
  userId: UserDoc['_id'],
  set: Record<string, unknown>,
  unset: Record<string, ''>,
): Promise<UserDoc> {
  const update: Record<string, unknown> = { $set: set };
  if (Object.keys(unset).length) update['$unset'] = unset;
  const user = await User.findByIdAndUpdate(userId, update, { returnDocument: 'after' }).lean<UserDoc>();
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Your session is no longer valid', { reason: 'revoked' });
  return user;
}

const resumeQuerySchema = z.object({
  save: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => v === 'true' || v === '1'),
});

/** Merge a parsed resume into the stored profile: fill empty fields, union skills and links. */
function mergeIntoStored(stored: ParsedProfile, parsed: ParsedProfile): ParsedProfile {
  const skillNames = new Set(stored.skills.map((s) => s.name.toLowerCase()));
  const linkUrls = new Set(stored.links.map((l) => l.url.toLowerCase()));
  return profileInputSchema.parse({
    ...stored,
    headline: stored.headline ?? parsed.headline,
    summary: stored.summary ?? parsed.summary,
    skills: [...stored.skills, ...parsed.skills.filter((s) => !skillNames.has(s.name.toLowerCase()))].slice(0, 200),
    education: stored.education.length ? stored.education : parsed.education,
    experience: stored.experience.length ? stored.experience : parsed.experience,
    experienceYears: stored.experienceYears || parsed.experienceYears,
    projects: stored.projects.length ? stored.projects : parsed.projects,
    links: [...stored.links, ...parsed.links.filter((l) => !linkUrls.has(l.url.toLowerCase()))].slice(0, 20),
    preferredRoles: stored.preferredRoles.length ? stored.preferredRoles : parsed.preferredRoles,
    languages: stored.languages.length ? stored.languages : parsed.languages,
  });
}

export function createProfileRouter(ctx: AppContext): Router {
  const router = Router();
  const resumeLimiter = createRateLimiter('resume', ctx.rateLimits.resume, ctx.redis, 'user');

  router.get('/profile', async (req, res) => {
    const { _id } = currentUser(req);
    const doc = await Profile.findOne({ userId: _id }).lean<ProfileDoc>();
    res.json(toProfileResponse(_id, doc));
  });

  router.put('/profile', async (req, res) => {
    const { _id } = currentUser(req);
    const body = parse(profileInputSchema, req.body);
    const { doc } = await saveProfile(ctx, _id, body);
    res.json(toProfileResponse(_id, doc));
  });

  router.patch('/profile', async (req, res) => {
    const { _id } = currentUser(req);
    const patch = parse(profilePatchSchema, req.body);
    const stored = await Profile.findOne({ userId: _id }).lean<ProfileDoc>();
    const merged = { ...pickProfileFields(stored), ...patch };
    const { doc } = await saveProfile(ctx, _id, merged);
    res.json(toProfileResponse(_id, doc));
  });

  // ── Onboarding save and resume (the conversational flow persists every page) ──
  router.patch('/profile/onboarding', async (req, res) => {
    const { _id, doc } = currentUser(req);
    const body = parse(onboardingProgressSchema, req.body);
    const { set, unset } = answersUpdate(doc.onboardingAnswers, body.answers);
    // A finished onboarding stays `done`; answers can still be edited (Profile links back here).
    if (body.step !== undefined && !doc.onboardingCompletedAt) set['onboardingStep'] = body.step;
    set['onboardingUpdatedAt'] = ctx.now();
    res.json(await buildMe(ctx, await updateOnboarding(_id, set, unset)));
  });

  router.post('/profile/onboarding/complete', async (req, res) => {
    const { _id, id, doc } = currentUser(req);
    const body = parse(onboardingCompleteSchema, req.body ?? {});
    const { set, unset } = answersUpdate(doc.onboardingAnswers, body.answers);
    const now = ctx.now();
    set['onboardingStep'] = 'done';
    set['onboardingUpdatedAt'] = now;
    // Idempotent: a second call keeps the original completion time.
    if (!doc.onboardingCompletedAt) set['onboardingCompletedAt'] = now;
    const user = await updateOnboarding(_id, set, unset);
    // Warm the radar now (the final onboarding screen polls /v1/feed/summary); dedup ids make
    // this a no-op when a profile save already queued the same jobs.
    if (await Profile.exists({ userId: _id })) {
      await Promise.all([
        ctx.queue.add('embed', { kind: 'profile', userId: id }, { dedupId: `embed:profile:${id}` }),
        ctx.queue.add('match', { userId: id, reason: 'profile' }, { dedupId: `match:${id}` }),
      ]);
    }
    res.json(await buildMe(ctx, user));
  });

  const singleFile: RequestHandler = (req, res, next) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err) next(err);
      else next();
    });
  };

  router.post('/profile/resume', resumeLimiter, singleFile, async (req, res) => {
    const startedAt = Date.now();
    const { _id, id } = currentUser(req);
    const { save } = parse(resumeQuerySchema, req.query, 'query');
    const file = req.file;
    if (!file) throw badRequest('Attach the resume as multipart field "file"');
    const kind = sniffResumeKind(file.buffer, file.originalname, file.mimetype);
    if (!kind) {
      throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Upload a PDF, Word (.docx), PNG or JPEG resume', {
        received: file.mimetype,
      });
    }
    const { text, extraction, ocr } = await resumeText(ctx, file.buffer, kind);

    const parsed = parseResumeText(text);
    let profile = parsed.profile;
    let parsedFrom: 'deterministic' | 'llm' = 'deterministic';
    const warnings = extraction === 'ocr' ? [SCAN_WARNING, ...parsed.warnings] : [...parsed.warnings];

    const { resolved } = await llmForUser(ctx, _id, 'resume');
    if (resolved.ok) {
      const deadline = startedAt + RESUME_ROUTE_BUDGET_MS;
      if (deadline - Date.now() < MIN_ENRICH_MS) {
        warnings.push('AI enrichment skipped: reading the scan took too long. Showing the rule-based result.');
      } else {
        const enriched = await enrichResume(ctx, id, resolved.config, text, deadline);
        if (enriched.ok) {
          profile = mergeLlmResume(profile, enriched.object);
          parsedFrom = 'llm';
        } else {
          warnings.push(`AI enrichment skipped: ${LLM_REASON_MESSAGES[enriched.reason]}. Showing the rule-based result.`);
        }
      }
    }

    let saved = false;
    if (save) {
      const stored = await Profile.findOne({ userId: _id }).lean<ProfileDoc>();
      const merged = stored ? mergeIntoStored(pickProfileFields(stored), profile) : profile;
      const resume: ResumeMeta = {
        fileName: file.originalname.slice(0, 200),
        mimeType: file.mimetype,
        size: file.size,
        textChars: parsed.textChars,
        uploadedAt: ctx.now(),
        parsedFrom,
        extraction,
      };
      await saveProfile(ctx, _id, merged, { resume, resumeText: text.slice(0, RESUME_TEXT_STORED) });
      saved = true;
    }

    res.json({
      profile,
      parsedFrom,
      warnings,
      sections: parsed.sections,
      skills: parsed.skills,
      emails: parsed.emails,
      phones: parsed.phones,
      textChars: parsed.textChars,
      extraction,
      ocr: ocr && extraction === 'ocr' ? { pages: ocr.pages, confidence: Math.round(ocr.confidence) } : null,
      saved,
    });
  });

  return router;
}
