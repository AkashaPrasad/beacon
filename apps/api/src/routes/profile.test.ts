import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { SCAN_WARNING } from './profile.js';
import { DEFAULT_RATE_LIMITS } from '../middleware/rateLimit.js';
import { Profile } from '../models/profile.js';
import { Settings } from '../models/settings.js';
import { imageSize, ocrImage, OcrError, shutdownOcr } from '../resume/ocr.js';
import { as, buildTestApp, createUser, resetDb } from '../test/helpers.js';
import { mockLlm } from '../test/llm-mock.js';
import {
  makeDocx,
  makePdf,
  makeResumeImage,
  makeScannedPdf,
  makeScannedResumePdf,
} from '../test/resume-fixtures.js';

const fullProfile = {
  headline: 'Backend developer',
  skills: [{ name: 'Go', proficiency: 'advanced' }],
  education: [{ institution: 'IIT Madras', degree: 'B.Tech CSE', gradYear: 2027 }],
  preferredRoles: ['backend_engineer'],
  preferredLocations: ['Bengaluru'],
  remotePref: 'prefer_remote',
  opportunityTypes: ['internship'],
};

describe('profile CRUD', () => {
  beforeEach(resetDb);

  it('GET returns defaults with exists:false before anything is saved', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const res = await as(app, user).get('/v1/profile');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ exists: false, profileHash: null, resume: null });
    expect(res.body.profile).toMatchObject({ userId: user._id.toString(), skills: [], remotePref: 'any' });
  });

  it('PUT validates, saves, bumps profileHash and enqueues embed + match once per change', async () => {
    const { app, queue } = buildTestApp();
    const user = await createUser();
    const api = as(app, user);
    const invalid = await api.put('/v1/profile').send({ remotePref: 'mars', education: [{ institution: 'X' }] });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION');
    expect(invalid.body.error.issues.map((i: { path: string[] }) => i.path[0])).toEqual(expect.arrayContaining(['remotePref', 'education']));

    const saved = await api.put('/v1/profile').send(fullProfile);
    expect(saved.status).toBe(200);
    expect(saved.body.exists).toBe(true);
    expect(saved.body.profileHash).toMatch(/^[a-f0-9]{64}$/);
    expect(saved.body.profile.skills[0]).toEqual({ name: 'Go', proficiency: 'advanced', years: null });
    expect(queue.of('embed')).toEqual([{ kind: 'profile', userId: user._id.toString() }]);
    expect(queue.of('match')).toEqual([{ userId: user._id.toString(), reason: 'profile' }]);

    const same = await api.put('/v1/profile').send(fullProfile);
    expect(same.body.profileHash).toBe(saved.body.profileHash);
    expect(queue.of('match')).toHaveLength(1);

    const patched = await api.patch('/v1/profile').send({ headline: 'Platform engineer' });
    expect(patched.body.profile.headline).toBe('Platform engineer');
    expect(patched.body.profile.skills).toHaveLength(1);
    expect(patched.body.profileHash).not.toBe(saved.body.profileHash);
    expect(queue.of('match')).toHaveLength(2);

    const badPatch = await api.patch('/v1/profile').send({ skills: 'nope' });
    expect(badPatch.status).toBe(400);
  });

  it('profiles are per user', async () => {
    const { app } = buildTestApp();
    const a = await createUser();
    const b = await createUser();
    await as(app, a).put('/v1/profile').send(fullProfile);
    const other = await as(app, b).get('/v1/profile');
    expect(other.body.exists).toBe(false);
  });
});

describe('POST /v1/profile/resume', () => {
  beforeEach(resetDb);

  it('parses a text PDF deterministically (AI consent not given)', async () => {
    const { app, queue } = buildTestApp();
    const user = await createUser();
    const res = await as(app, user)
      .post('/v1/profile/resume')
      .attach('file', await makePdf(), { filename: 'resume.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(200);
    expect(res.body.parsedFrom).toBe('deterministic');
    expect(res.body.saved).toBe(false);
    expect(res.body.profile.skills.map((s: { name: string }) => s.name)).toEqual(expect.arrayContaining(['React', 'Node.js']));
    expect(res.body.profile.education[0]).toMatchObject({ gradYear: 2026 });
    expect(res.body.sections).toEqual(expect.arrayContaining(['education', 'skills']));
    expect(res.body.emails).toContain('priya.sharma@example.com');
    expect(queue.jobs).toHaveLength(0);
    expect(await Profile.countDocuments()).toBe(0);
  });

  it('parses a DOCX and saves it with ?save=true', async () => {
    const { app, queue } = buildTestApp();
    const user = await createUser();
    const res = await as(app, user)
      .post('/v1/profile/resume?save=true')
      .attach('file', await makeDocx(), { filename: 'resume.docx' });
    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(true);
    expect(res.body.profile.projects.length).toBeGreaterThan(0);
    const stored = await Profile.findOne({ userId: user._id }).lean();
    expect(stored?.resume).toMatchObject({ fileName: 'resume.docx', parsedFrom: 'deterministic' });
    expect(stored?.resumeText).toContain('Priya Sharma');
    expect(queue.of('match')).toHaveLength(1);

    // A second upload merges into the stored profile instead of replacing it.
    await as(app, user).patch('/v1/profile').send({ headline: 'Kept headline' });
    const again = await as(app, user)
      .post('/v1/profile/resume?save=1')
      .attach('file', await makeDocx(), { filename: 'resume.docx' });
    expect(again.status).toBe(200);
    const merged = await as(app, user).get('/v1/profile');
    expect(merged.body.profile.headline).toBe('Kept headline');
  });

  it('enriches with the LLM when AI is enabled and resume consent is given', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    await as(app, user).patch('/v1/me').send({ consent: { version: '1', aiMode: 'beacon', resumeToAi: true } });
    const bodies = mockLlm(
      '```json\n' +
        JSON.stringify({
          headline: 'Full-stack engineer',
          skills: ['GraphQL', { name: 'react' }],
          education: [{ institution: 'IIT Bombay', degree: 'B.Tech CSE', degreeLevel: 'bachelor', gradYear: '2026' }],
          experience: [{ company: 'Razorpay', title: 'SDE Intern', startDate: '2025-05', endDate: '2025-07', current: false }],
          projects: [{ name: 'Beacon Clone', url: 'https://github.com/p/beacon', skills: ['React'] }],
          links: [{ kind: 'github', url: 'https://github.com/priyasharma' }],
          experienceYears: 0.3,
        }) +
        '\n```',
    );
    const res = await as(app, user)
      .post('/v1/profile/resume')
      .attach('file', await makePdf(), { filename: 'resume.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(200);
    expect(res.body.parsedFrom).toBe('llm');
    expect(res.body.profile.headline).toBe('Full-stack engineer');
    expect(res.body.profile.skills.map((s: { name: string }) => s.name)).toContain('GraphQL');
    expect(res.body.profile.experience[0]).toMatchObject({ company: 'Razorpay', title: 'SDE Intern' });
    expect(bodies[0]).toMatchObject({ model: 'test-model', max_tokens: 4096, response_format: { type: 'json_object' } });
  });

  it('falls back to the deterministic result when the LLM fails', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    await as(app, user).patch('/v1/me').send({ consent: { version: '1', aiMode: 'beacon', resumeToAi: true } });
    mockLlm('', { status: 500, times: 3 });
    const res = await as(app, user)
      .post('/v1/profile/resume')
      .attach('file', await makePdf(), { filename: 'resume.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(200);
    expect(res.body.parsedFrom).toBe('deterministic');
    expect(res.body.warnings.join(' ')).toMatch(/AI enrichment skipped/);
  });

  it('skips the LLM when the daily cap is reached', async () => {
    const { app } = buildTestApp({}, { LLM_DAILY_USER_CAP: '0' });
    const user = await createUser();
    await as(app, user).patch('/v1/me').send({ consent: { version: '1', aiMode: 'beacon', resumeToAi: true } });
    const res = await as(app, user)
      .post('/v1/profile/resume')
      .attach('file', await makePdf(), { filename: 'resume.pdf', contentType: 'application/pdf' });
    expect(res.body.parsedFrom).toBe('deterministic');
    expect(res.body.warnings.join(' ')).toMatch(/Daily AI limit/);
  });

  it('a scan with no readable text even after OCR → 422 RESUME_NO_TEXT with a clear message', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const res = await as(app, user)
      .post('/v1/profile/resume')
      .attach('file', await makeScannedPdf(), { filename: 'scan.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('RESUME_NO_TEXT');
    expect(res.body.error.message).toMatch(/even after scanning/);
    expect(res.body.error.details).toMatchObject({ ocr: true, minChars: 100 });
  });

  it('corrupt PDF → 422 RESUME_UNREADABLE', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const res = await as(app, user)
      .post('/v1/profile/resume')
      .attach('file', Buffer.from('%PDF-1.7\nthis is not really a pdf'), { filename: 'bad.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('RESUME_UNREADABLE');
  });

  it('20 MB → 413, .exe → 415, missing file → 400', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const big = Buffer.alloc(20 * 1024 * 1024, 0x20);
    big.write('%PDF-1.7');
    const tooBig = await as(app, user).post('/v1/profile/resume').attach('file', big, { filename: 'big.pdf' });
    expect(tooBig.status).toBe(413);
    expect(tooBig.body.error.code).toBe('PAYLOAD_TOO_LARGE');

    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(1024)]);
    const bad = await as(app, user)
      .post('/v1/profile/resume')
      .attach('file', exe, { filename: 'resume.exe', contentType: 'application/octet-stream' });
    expect(bad.status).toBe(415);
    expect(bad.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');

    const renamed = await as(app, user)
      .post('/v1/profile/resume')
      .attach('file', exe, { filename: 'resume.pdf', contentType: 'application/pdf' });
    expect(renamed.status).toBe(415);

    const none = await as(app, user).post('/v1/profile/resume').field('note', 'x');
    expect(none.status).toBe(400);
    const wrongField = await as(app, user).post('/v1/profile/resume').attach('cv', await makePdf(), 'r.pdf');
    expect(wrongField.status).toBe(400);
  });

  it('rate-limits resume uploads per user', async () => {
    const { app } = buildTestApp({ rateLimits: { ...DEFAULT_RATE_LIMITS, resume: { windowMs: 60_000, limit: 1 } } });
    const user = await createUser();
    const pdf = await makePdf();
    const first = await as(app, user).post('/v1/profile/resume').attach('file', pdf, 'r.pdf');
    expect(first.status).toBe(200);
    const second = await as(app, user).post('/v1/profile/resume').attach('file', pdf, 'r.pdf');
    expect(second.status).toBe(429);
    expect(await Settings.countDocuments()).toBe(1);
  });
});

describe('POST /v1/profile/resume (OCR for scans and photos)', () => {
  beforeEach(resetDb);
  afterAll(shutdownOcr);

  it('reads an image-only PDF with OCR and parses it like text', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const res = await as(app, user)
      .post('/v1/profile/resume?save=true')
      .attach('file', await makeScannedResumePdf(), { filename: 'scan.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(200);
    expect(res.body.extraction).toBe('ocr');
    expect(res.body.ocr).toMatchObject({ pages: 1 });
    expect(res.body.ocr.confidence).toBeGreaterThan(60);
    expect(res.body.warnings[0]).toBe(SCAN_WARNING);
    expect(res.body.emails).toContain('priya.sharma@example.com');
    const skills = res.body.profile.skills.map((s: { name: string }) => s.name);
    expect(skills).toEqual(expect.arrayContaining(['React', 'TypeScript', 'Python', 'Docker']));
    expect(res.body.profile.education[0]).toMatchObject({ gradYear: 2026 });
    const stored = await Profile.findOne({ userId: user._id }).lean();
    expect(stored?.resume).toMatchObject({ fileName: 'scan.pdf', extraction: 'ocr' });
  });

  it('reads PNG and JPEG uploads directly', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const png = await as(app, user)
      .post('/v1/profile/resume')
      .attach('file', await makeResumeImage(), { filename: 'resume.png', contentType: 'image/png' });
    expect(png.status).toBe(200);
    expect(png.body.extraction).toBe('ocr');
    expect(png.body.profile.skills.map((s: { name: string }) => s.name)).toContain('PostgreSQL');

    const jpeg = await as(app, user)
      .post('/v1/profile/resume')
      .attach('file', await makeResumeImage(undefined, 'jpeg'), { filename: 'resume.jpg', contentType: 'image/jpeg' });
    expect(jpeg.status).toBe(200);
    expect(jpeg.body.extraction).toBe('ocr');
    expect(jpeg.body.emails).toContain('priya.sharma@example.com');
  });

  it('text PDFs skip OCR (extraction: text, no scan warning)', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const res = await as(app, user)
      .post('/v1/profile/resume')
      .attach('file', await makePdf(), { filename: 'resume.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(200);
    expect(res.body.extraction).toBe('text');
    expect(res.body.ocr).toBeNull();
    expect(res.body.warnings).not.toContain(SCAN_WARNING);
  });

  it('OCR text goes through the LLM enrichment too', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    await as(app, user).patch('/v1/me').send({ consent: { version: '1', aiMode: 'beacon', resumeToAi: true } });
    const bodies = mockLlm({ headline: 'Full-stack engineer', skills: ['GraphQL'] });
    const res = await as(app, user)
      .post('/v1/profile/resume')
      .attach('file', await makeResumeImage(), { filename: 'resume.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.parsedFrom).toBe('llm');
    expect(res.body.extraction).toBe('ocr');
    expect(res.body.profile.headline).toBe('Full-stack engineer');
    expect(String((bodies[0]?.['messages'] as { content: string }[]).at(-1)?.content)).toContain('Razorpay');
  });

  it('a blank photo → 422 RESUME_NO_TEXT; a decompression-bomb PNG header → 422 RESUME_UNREADABLE', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const blank = await as(app, user)
      .post('/v1/profile/resume')
      .attach('file', await makeResumeImage([]), { filename: 'blank.png', contentType: 'image/png' });
    expect(blank.status).toBe(422);
    expect(blank.body.error.code).toBe('RESUME_NO_TEXT');

    const bomb = await makeResumeImage(['x']);
    bomb.writeUInt32BE(20_000, 16);
    bomb.writeUInt32BE(20_000, 20);
    const huge = await as(app, user).post('/v1/profile/resume').attach('file', bomb, { filename: 'huge.png' });
    expect(huge.status).toBe(422);
    expect(huge.body.error.code).toBe('RESUME_UNREADABLE');
    expect(huge.body.error.message).toMatch(/too large/);
  });

  it('imageSize reads PNG and JPEG headers; OCR past its budget fails with a timeout', async () => {
    const png = await makeResumeImage(['x']);
    expect(imageSize(png, 'png')).toEqual({ width: 1240, height: 1754 });
    expect(imageSize(await makeResumeImage(['x'], 'jpeg'), 'jpeg')).toEqual({ width: 1240, height: 1754 });
    expect(imageSize(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'jpeg')).toBeNull();
    const err = await ocrImage(png, 'png', 1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OcrError);
    expect((err as OcrError).reason).toBe('timeout');
    // The worker was terminated; the next call starts a fresh one.
    expect((await ocrImage(await makeResumeImage(), 'png')).text).toMatch(/Razorpay/);
  });
});
