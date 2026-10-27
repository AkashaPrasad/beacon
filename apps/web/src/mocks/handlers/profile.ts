/**
 * MSW handlers for docs/API.md §4 (profile & resume).
 *
 * Scenario: localStorage['beacon:mock:profile'] = 'full' (default: the fixture student, resume on file)
 *                                              | 'empty' (no stored profile, `exists: false`; onboarding)
 *
 * Resume upload (`POST /v1/profile/resume`, ~700 ms "parse"), decided by the file:
 *   not .pdf/.docx → 415 · > 10 MB → 413 · name contains "scanned" → 422 RESUME_NO_TEXT
 *   "corrupt" / "encrypted" → 422 RESUME_UNREADABLE · "nograd" → parse without education
 *   "noskills" → parse with no skills (+ warning) · "refined" → parsedFrom: 'llm' · anything else → full parse
 */
import { LIMITS, profileInputSchema, profilePatchSchema, type Profile } from '@kestrel/shared';
import { sampleProfiles } from '@kestrel/shared/fixtures';
import { delay, http, HttpResponse } from 'msw';

const USER_ID = 'usr_aarav';

function scenario(): 'full' | 'empty' {
  try {
    return localStorage.getItem('beacon:mock:profile') === 'empty' ? 'empty' : 'full';
  } catch {
    return 'full';
  }
}

interface ResumeMeta {
  fileName: string;
  mimeType: string;
  size: number;
  textChars: number;
  uploadedAt: string;
  parsedFrom: 'deterministic' | 'llm';
}

interface ProfileDb {
  profile: Profile;
  exists: boolean;
  resume: ResumeMeta | null;
}

let db: ProfileDb | null = null;

function emptyProfile(): Profile {
  return { userId: USER_ID, embeddingHash: null, ...profileInputSchema.parse({}) };
}

function store(): ProfileDb {
  if (db) return db;
  if (scenario() === 'empty') {
    db = { profile: emptyProfile(), exists: false, resume: null };
  } else {
    const fixture = sampleProfiles[0]!;
    db = {
      profile: { ...fixture, updatedAt: new Date() },
      exists: true,
      resume: {
        fileName: 'aarav-resume.pdf',
        mimeType: 'application/pdf',
        size: 182_400,
        textChars: 4_812,
        uploadedAt: new Date(Date.now() - 6 * 86_400_000).toISOString(),
        parsedFrom: 'deterministic',
      },
    };
  }
  return db;
}

/** Test helper: forget all mock state. */
export function resetProfileMock(): void {
  db = null;
}

function response() {
  const s = store();
  return {
    profile: s.profile,
    exists: s.exists,
    profileHash: s.exists ? `hash-${JSON.stringify(s.profile).length}` : null,
    resume: s.resume,
  };
}

const error = (status: number, code: string, message: string) =>
  HttpResponse.json({ error: { code, message } }, { status });

/** What the deterministic parser "finds" in the mock resume. */
function parsedDraft(name: string) {
  const lower = name.toLowerCase();
  const base = {
    headline: 'CS undergrad building full-stack and backend projects',
    summary: null,
    skills: [
      { name: 'TypeScript', proficiency: 'intermediate', years: null },
      { name: 'React', proficiency: 'advanced', years: null },
      { name: 'Node.js', proficiency: 'intermediate', years: null },
      { name: 'Go', proficiency: 'beginner', years: null },
      { name: 'PostgreSQL', proficiency: 'intermediate', years: null },
      { name: 'Docker', proficiency: 'beginner', years: null },
      { name: 'Git', proficiency: 'advanced', years: null },
    ],
    education: [
      {
        institution: 'Indus Valley Institute of Technology',
        degree: 'B.Tech Computer Science',
        degreeLevel: 'bachelor',
        field: 'Computer Science',
        startYear: 2023,
        gradYear: 2027,
        current: true,
        gpa: null,
      },
    ],
    experience: [
      {
        company: 'Kaveri Labs',
        title: 'Backend Intern',
        startDate: '2025-05-01T00:00:00.000Z',
        endDate: '2025-07-31T00:00:00.000Z',
        current: false,
        description: 'Built a job queue dashboard in Go and Postgres.',
      },
    ],
    experienceYears: 0.25,
    projects: [
      {
        name: 'Hostel mess tracker',
        description: 'MERN app used by 400 students to rate and plan meals.',
        url: 'https://github.com/example/mess-tracker',
        skills: ['React', 'Node.js', 'MongoDB'],
      },
    ],
    links: [
      { kind: 'github', url: 'https://github.com/example' },
      { kind: 'linkedin', url: 'https://linkedin.com/in/example' },
    ],
    preferredRoles: [],
    languages: [{ name: 'English', proficiency: 'professional' }],
  };
  const warnings: string[] = [];
  if (lower.includes('nograd')) {
    base.education = [];
    warnings.push('No graduation year found');
  }
  if (lower.includes('noskills')) {
    base.skills = [];
    warnings.push('No skills section found');
  }
  if (!lower.includes('nograd') && !lower.includes('noskills')) warnings.push('No summary section found');
  return { draft: profileInputSchema.parse(base), warnings };
}

export const profileHandlers = [
  http.get('*/v1/profile', async () => {
    await delay(120);
    return HttpResponse.json(response());
  }),

  http.put('*/v1/profile', async ({ request }) => {
    await delay(160);
    const parsed = profileInputSchema.safeParse(await request.json());
    if (!parsed.success) return error(400, 'VALIDATION', 'Invalid request');
    const s = store();
    s.profile = { ...s.profile, ...parsed.data, updatedAt: new Date() };
    s.exists = true;
    return HttpResponse.json(response());
  }),

  http.patch('*/v1/profile', async ({ request }) => {
    await delay(160);
    const parsed = profilePatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return HttpResponse.json(
        { error: { code: 'VALIDATION', message: 'Invalid request', issues: parsed.error.issues } },
        { status: 400 },
      );
    }
    const s = store();
    const defined = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
    s.profile = { ...s.profile, ...defined, updatedAt: new Date() } as Profile;
    s.exists = true;
    return HttpResponse.json(response());
  }),

  http.post('*/v1/profile/resume', async ({ request }) => {
    const url = new URL(request.url);
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return error(400, 'BAD_REQUEST', 'Attach the resume as the "file" field.');
    const name = file.name.toLowerCase();
    if (!/\.(pdf|docx)$/.test(name)) return error(415, 'UNSUPPORTED_MEDIA_TYPE', 'Only PDF or DOCX resumes are supported.');
    if (file.size > LIMITS.resumeMaxBytes) return error(413, 'PAYLOAD_TOO_LARGE', 'Resume is larger than 10 MB.');
    await delay(700);
    if (name.includes('scanned')) return error(422, 'RESUME_NO_TEXT', 'This PDF has no readable text.');
    if (name.includes('corrupt') || name.includes('encrypted')) {
      return error(422, 'RESUME_UNREADABLE', 'The file is corrupt or encrypted.');
    }
    const { draft, warnings } = parsedDraft(name);
    const parsedFrom = name.includes('refined') ? 'llm' : 'deterministic';
    const save = url.searchParams.get('save') === 'true';
    if (save) {
      const s = store();
      s.profile = { ...s.profile, ...draft, userId: USER_ID, updatedAt: new Date() };
      s.exists = true;
      s.resume = {
        fileName: file.name,
        mimeType: file.type || 'application/pdf',
        size: file.size,
        textChars: 3_920,
        uploadedAt: new Date().toISOString(),
        parsedFrom,
      };
    }
    return HttpResponse.json({
      profile: draft,
      parsedFrom,
      warnings,
      sections: ['education', 'experience', 'projects', 'skills', 'links'],
      skills: draft.skills.map((s) => ({ canonical: s.name, matchedAlias: s.name, count: 1 })),
      emails: ['aarav@example.com'],
      phones: [],
      textChars: 3_920,
      saved: save,
    });
  }),
];
