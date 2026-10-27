/** Deadline wording and urgency (DESIGN §3.3 deadline colours, §6.2 DeadlineText). */

export type DeadlineKindKey = 'date' | 'rolling' | 'unknown';
export type DeadlineTone = 'far' | 'near' | 'soon' | 'today' | 'closed' | 'rolling' | 'unknown';

export interface DeadlineStatus {
  /** `6d left` · `Due today` · `Due in 5h` · `Closed 2d ago` · `Rolling` · `No deadline` */
  text: string;
  tone: DeadlineTone;
  /** Milliseconds until the deadline (negative when closed); null without a date. */
  msLeft: number | null;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function deadlineStatus(
  deadlineAt: Date | null | undefined,
  options: { now?: Date; kind?: DeadlineKindKey } = {},
): DeadlineStatus {
  const { now = new Date(), kind = deadlineAt ? 'date' : 'unknown' } = options;
  if (kind === 'rolling') return { text: 'Rolling', tone: 'rolling', msLeft: null };
  if (!deadlineAt) return { text: 'No deadline', tone: 'unknown', msLeft: null };

  const msLeft = deadlineAt.getTime() - now.getTime();
  if (msLeft < 0) {
    const ago = Math.max(1, Math.round(-msLeft / DAY));
    return { text: -msLeft < DAY ? 'Closed today' : `Closed ${ago}d ago`, tone: 'closed', msLeft };
  }
  if (msLeft < DAY) {
    const hours = Math.floor(msLeft / HOUR);
    return {
      text: hours < 1 ? 'Due within 1h' : hours < 12 ? `Due in ${hours}h` : 'Due today',
      tone: 'today',
      msLeft,
    };
  }
  const days = Math.ceil(msLeft / DAY);
  const tone: DeadlineTone = days <= 3 ? 'soon' : days <= 14 ? 'near' : 'far';
  return { text: `${days}d left`, tone, msLeft };
}

/** CSS colour variable for a tone (text only; always paired with words). */
export const DEADLINE_TONE_VAR: Record<DeadlineTone, string> = {
  far: 'var(--color-deadline-far)',
  near: 'var(--color-deadline-near)',
  soon: 'var(--color-deadline-soon)',
  today: 'var(--color-deadline-today)',
  closed: 'var(--color-fg-disabled)',
  rolling: 'var(--color-fg-tertiary)',
  unknown: 'var(--color-fg-tertiary)',
};
