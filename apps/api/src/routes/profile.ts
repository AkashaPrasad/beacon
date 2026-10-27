import { LIMITS, profileInputSchema, profilePatchSchema } from '@kestrel/shared';
import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';

import { LLM_REASON_MESSAGES, llmForUser } from '../ai/llm.js';
import type { AppContext } from '../context.js';
import { badRequest, HttpError } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { currentUser } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { Profile, type ProfileDoc, type ResumeMeta } from '../models/profile.js';
import { enrichResume, mergeLlmResume } from '../resume/enrich.js';
import { extractResumeText, MIN_RESUME_CHARS, sniffResumeKind } from '../resume/extract.js';
import { parseResumeText, type ParsedProfile } from '../resume/parse.js';
import { pickProfileFields, saveProfile, toProfileResponse } from '../services/profile.js';

const RESUME_TEXT_STORED = 50_000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITS.resumeMaxBytes, files: 1, fields: 5 },
});

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

  const singleFile: RequestHandler = (req, res, next) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err) next(err);
      else next();
    });
  };

  router.post('/profile/resume', resumeLimiter, singleFile, async (req, res) => {
    const { _id, id } = currentUser(req);
    const { save } = parse(resumeQuerySchema, req.query, 'query');
    const file = req.file;
    if (!file) throw badRequest('Attach the resume as multipart field "file"');
    const kind = sniffResumeKind(file.buffer, file.originalname, file.mimetype);
    if (!kind) {
      throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Upload a PDF or Word (.docx) resume', {
        received: file.mimetype,
      });
    }
    const text = await extractResumeText(file.buffer, kind);
    const visible = text.replace(/\s+/g, ' ').trim();
    if (visible.length < MIN_RESUME_CHARS) {
      throw new HttpError(
        422,
        'RESUME_NO_TEXT',
        'This looks like a scanned or image-only resume, so there is no text to read. Export it as a text-based PDF (or upload the .docx) and try again, or fill your profile in by hand.',
        { textChars: visible.length, minChars: MIN_RESUME_CHARS },
      );
    }

    const parsed = parseResumeText(text);
    let profile = parsed.profile;
    let parsedFrom: 'deterministic' | 'llm' = 'deterministic';
    const warnings = [...parsed.warnings];

    const { resolved } = await llmForUser(ctx, _id, 'resume');
    if (resolved.ok) {
      const enriched = await enrichResume(ctx, id, resolved.config, text);
      if (enriched.ok) {
        profile = mergeLlmResume(profile, enriched.object);
        parsedFrom = 'llm';
      } else {
        warnings.push(`AI enrichment skipped: ${LLM_REASON_MESSAGES[enriched.reason]}. Showing the rule-based result.`);
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
      saved,
    });
  });

  return router;
}
