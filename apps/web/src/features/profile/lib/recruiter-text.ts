/** Plain-text and display helpers for "What recruiters see" (RecruiterPreview). */
import {
  displayUrl,
  groupSkills,
  PROFICIENCY_STEPS,
  proficiencyStep,
  shown,
  type ProfileDraft,
} from '@/features/profile/lib/profile-model';

export const proficiencyLabel = (p: ProfileDraft['skills'][number]['proficiency']) =>
  PROFICIENCY_STEPS.find((s) => s.id === proficiencyStep(p))?.label ?? '';

export const monthYear = (d: Date | null) =>
  d ? new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d) : '';

/** Plain-text version for pasting into an application form. */
export function profileAsText(draft: ProfileDraft, name: string, email: string | null): string {
  const lines: string[] = [name];
  if (draft.headline) lines.push(draft.headline);
  const contact = [email, ...draft.links.map((l) => displayUrl(l.url))].filter(Boolean);
  if (contact.length) lines.push(contact.join(' · '));
  if (draft.summary) lines.push('', draft.summary);
  if (draft.education.length) {
    lines.push('', 'EDUCATION');
    for (const e of draft.education) {
      lines.push([shown(e.institution), shown(e.degree), `Class of ${e.gradYear}`].filter(Boolean).join(' — '));
    }
  }
  if (draft.skills.length) {
    lines.push('', 'SKILLS');
    for (const g of groupSkills(draft.skills)) lines.push(`${g.label}: ${g.skills.map((s) => s.name).join(', ')}`);
  }
  if (draft.experience.length) {
    lines.push('', 'EXPERIENCE');
    for (const x of draft.experience) {
      const when = [monthYear(x.startDate), x.current ? 'now' : monthYear(x.endDate)].filter(Boolean).join('–');
      lines.push(`${x.title}, ${x.company}${when ? ` (${when})` : ''}`);
      if (x.description) lines.push(`  ${x.description}`);
    }
  }
  if (draft.projects.length) {
    lines.push('', 'PROJECTS');
    for (const p of draft.projects) {
      lines.push(`${p.name}${p.url ? ` — ${displayUrl(p.url)}` : ''}`);
      if (p.description) lines.push(`  ${p.description}`);
    }
  }
  return lines.join('\n');
}

