/** Follow-up email template (USERFLOW §4.2). Beacon never sends email: the user copies it. */
import { formatDayMonth } from '../../sources/lib/format';

export interface FollowUpTemplateInput {
  title: string;
  company: string;
  appliedAt: Date | string | null;
  /** The student's name (from the session). */
  name?: string | null;
  /** Recruiter or team name if a contact is recorded. */
  contactName?: string | null;
  /** One line from the JD or profile; falls back to the role itself. */
  highlight?: string | null;
  timeZone?: string;
}

export interface FollowUpTemplate {
  subject: string;
  body: string;
  /** Subject + body joined as one clipboard string. */
  text: string;
}

export function buildFollowUpTemplate(input: FollowUpTemplateInput): FollowUpTemplate {
  const applied = input.appliedAt ? new Date(input.appliedAt) : null;
  const when =
    applied && !Number.isNaN(applied.getTime())
      ? ` on ${formatDayMonth(applied, input.timeZone ?? 'Asia/Kolkata')}`
      : '';
  const greeting = input.contactName?.trim() ? `Hi ${input.contactName.trim()},` : `Hi ${input.company} team,`;
  const highlight = input.highlight?.trim()
    ? `, especially ${input.highlight.trim().replace(/[.\s]+$/, '')}`
    : '';
  const signOff = input.name?.trim() ? `Thanks,\n${input.name.trim()}` : 'Thanks,';
  const subject = `Following up on my application — ${input.title}`;
  const body = [
    greeting,
    '',
    `I applied for the ${input.title} role${when} and wanted to check on its status. I'm still very interested${highlight}. Happy to share anything else that helps.`,
    '',
    signOff,
  ].join('\n');
  return { subject, body, text: `Subject: ${subject}\n\n${body}` };
}
