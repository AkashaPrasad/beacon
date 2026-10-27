import {
  canonicaliseSkill,
  educationSchema,
  experienceSchema,
  profileInputSchema,
  profileLinkSchema,
  projectSchema,
  type ProfileInput,
} from '@kestrel/shared';
import { z } from 'zod';

import { generateStructured, type LlmConfig, type LlmResult } from '../ai/llm.js';
import type { AppContext } from '../context.js';

import type { ParsedProfile } from './parse.js';

const nullableString = z.string().nullish();
const yearish = z.union([z.number(), z.string()]).nullish();

/** Deliberately loose: the model's output is cleaned item by item against the shared schemas. */
export const llmResumeSchema = z.object({
  headline: nullableString,
  summary: nullableString,
  skills: z.array(z.union([z.string(), z.object({ name: z.string() }).loose()])).nullish(),
  education: z.array(z.record(z.string(), z.unknown())).nullish(),
  experience: z.array(z.record(z.string(), z.unknown())).nullish(),
  projects: z.array(z.record(z.string(), z.unknown())).nullish(),
  links: z.array(z.record(z.string(), z.unknown())).nullish(),
  preferredRoles: z.array(z.string()).nullish(),
  experienceYears: z.union([z.number(), z.string()]).nullish(),
  gradYear: yearish,
});
export type LlmResume = z.infer<typeof llmResumeSchema>;

const SYSTEM = `You convert resume text into JSON. Output ONLY a JSON object with these keys:
{"headline": string|null, "summary": string|null,
 "skills": string[] (canonical technology/skill names),
 "education": [{"institution": string, "degree": string, "degreeLevel": "highschool"|"diploma"|"bachelor"|"master"|"phd"|"other", "field": string|null, "startYear": number|null, "gradYear": number, "current": boolean, "gpa": {"value": number, "scale": number}|null}],
 "experience": [{"company": string, "title": string, "startDate": "YYYY-MM"|null, "endDate": "YYYY-MM"|null, "current": boolean, "description": string|null}],
 "projects": [{"name": string, "description": string|null, "url": string|null, "skills": string[]}],
 "links": [{"kind": "github"|"linkedin"|"portfolio"|"leetcode"|"kaggle"|"devpost"|"scholar"|"other", "url": string}],
 "preferredRoles": string[], "experienceYears": number}
Use only facts present in the resume. Never invent employers, dates or links.`;

function toDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null;
  const m = /^(\d{4})(?:-(\d{1,2}))?/.exec(value);
  if (!m?.[1]) return null;
  return new Date(Date.UTC(Number(m[1]), m[2] ? Number(m[2]) - 1 : 0, 1));
}

function cleanList<T>(items: unknown[] | null | undefined, schema: z.ZodType<T>, prepare: (i: Record<string, unknown>) => unknown = (i) => i): T[] {
  const out: T[] = [];
  for (const item of items ?? []) {
    if (!item || typeof item !== 'object') continue;
    const parsed = schema.safeParse(prepare(item as Record<string, unknown>));
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** Merge LLM output over the deterministic draft: LLM wins for structure, skills are unioned. */
export function mergeLlmResume(base: ParsedProfile, llm: LlmResume): ParsedProfile {
  const skillNames = (llm.skills ?? [])
    .map((s) => (typeof s === 'string' ? s : s.name))
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 80)
    .map((s) => canonicaliseSkill(s) ?? s);
  const existing = new Set(base.skills.map((s) => s.name.toLowerCase()));
  const extraSkills = [...new Set(skillNames)]
    .filter((s) => !existing.has(s.toLowerCase()))
    .map((name) => ({ name, proficiency: 'intermediate' as const, years: null }));

  const education = cleanList(llm.education, educationSchema, (e) => ({
    ...e,
    gradYear: typeof e['gradYear'] === 'string' ? Number(e['gradYear']) : e['gradYear'],
    startYear: typeof e['startYear'] === 'string' ? Number(e['startYear']) : (e['startYear'] ?? null),
  }));
  const experience = cleanList(llm.experience, experienceSchema, (e) => ({
    ...e,
    startDate: toDate(e['startDate']),
    endDate: toDate(e['endDate']),
  }));
  const projects = cleanList(llm.projects, projectSchema, (p) => ({
    ...p,
    url: typeof p['url'] === 'string' && /^https?:\/\//.test(p['url']) ? p['url'] : null,
    skills: Array.isArray(p['skills']) ? (p['skills'] as unknown[]).filter((s) => typeof s === 'string') : [],
  }));
  const links = cleanList(llm.links, profileLinkSchema);
  const years = Number(llm.experienceYears);

  const merged: ProfileInput = {
    ...base,
    headline: llm.headline?.trim().slice(0, 160) || base.headline,
    summary: llm.summary?.trim().slice(0, 2_000) || base.summary,
    skills: [...base.skills, ...extraSkills].slice(0, 200),
    education: education.length ? education.slice(0, 10) : base.education,
    experience: experience.length ? experience.slice(0, 30) : base.experience,
    experienceYears: Number.isFinite(years) && years >= 0 && years <= 60 ? years : base.experienceYears,
    projects: projects.length ? projects.slice(0, 50) : base.projects,
    links: links.length ? dedupeLinks([...base.links, ...links]) : base.links,
    preferredRoles: base.preferredRoles.length
      ? base.preferredRoles
      : (llm.preferredRoles ?? []).map((r) => r.trim()).filter((r) => r && r.length <= 80).slice(0, 5),
  };
  const result = profileInputSchema.safeParse(merged);
  return result.success ? result.data : base;
}

function dedupeLinks(links: ParsedProfile['links']): ParsedProfile['links'] {
  const seen = new Set<string>();
  return links
    .filter((l) => {
      const key = l.url.toLowerCase().replace(/\/$/, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);
}

export const RESUME_TEXT_FOR_LLM = 24_000;

export async function enrichResume(
  ctx: AppContext,
  userId: string,
  config: LlmConfig,
  text: string,
): Promise<LlmResult<LlmResume>> {
  return generateStructured(ctx, {
    userId,
    purpose: 'resume',
    schema: llmResumeSchema,
    schemaName: 'resume_profile',
    system: SYSTEM,
    prompt: `Resume text:\n"""\n${text.slice(0, RESUME_TEXT_FOR_LLM)}\n"""`,
    config,
  });
}
