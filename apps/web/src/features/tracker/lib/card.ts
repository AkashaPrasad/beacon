/** Card footer facts (pure): the age label and what the footer should show for a tracker item. */
import type { TrackerItemDTO } from '@/api/types';
import { DAY_MS, type TrackerStage } from '@kestrel/shared';

import { STAGE_LABEL } from './stages';

function time(value: Date | string | null | undefined): number | null {
  if (value == null) return null;
  const t = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

/** When the item entered its current stage (last history entry for that stage). */
export function stageEnteredAt(item: Pick<TrackerItemDTO, 'stage' | 'history' | 'createdAt' | 'appliedAt'>): number | null {
  if (item.stage === 'applied') {
    const applied = time(item.appliedAt);
    if (applied !== null) return applied;
  }
  for (let i = item.history.length - 1; i >= 0; i -= 1) {
    const h = item.history[i];
    if (h && h.stage === item.stage) return time(h.at);
  }
  return time(item.createdAt);
}

const AGE_PREFIX: Record<TrackerStage, string> = {
  saved: 'Saved',
  applied: 'Applied',
  oa: 'Test',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  ghosted: 'Ghosted',
};

/** "Applied 12d", "Saved today", "Interview 3d". */
export function ageLabel(
  item: Pick<TrackerItemDTO, 'stage' | 'history' | 'createdAt' | 'appliedAt'>,
  now: Date,
): string {
  const at = stageEnteredAt(item);
  const prefix = AGE_PREFIX[item.stage];
  if (at === null) return prefix;
  const days = Math.max(0, Math.floor((now.getTime() - at) / DAY_MS));
  return days === 0 ? `${prefix} today` : `${prefix} ${days}d`;
}

/** Long form for screen readers: "Applied 12 days ago". */
export function ageSentence(
  item: Pick<TrackerItemDTO, 'stage' | 'history' | 'createdAt' | 'appliedAt'>,
  now: Date,
): string {
  const at = stageEnteredAt(item);
  const label = item.stage === 'applied' ? 'Applied' : `In ${STAGE_LABEL[item.stage]}`;
  if (at === null) return label;
  const days = Math.max(0, Math.floor((now.getTime() - at) / DAY_MS));
  if (days === 0) return `${label} today`;
  return `${label} ${days === 1 ? '1 day' : `${days} days`} ${item.stage === 'applied' ? 'ago' : ''}`.trim();
}

/** Deadlines matter on cards that still have something to do. */
export function showsDeadline(stage: TrackerStage): boolean {
  return stage === 'saved' || stage === 'oa' || stage === 'offer';
}

export function notesCount(notes: string): number {
  return notes.trim() ? notes.trim().split(/\n+/).filter(Boolean).length : 0;
}
