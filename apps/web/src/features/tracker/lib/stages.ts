/**
 * Tracker stage presentation (UX restructure v2 §2.10, D10): five active columns, Saved → Applied →
 * OA / Test → Interview → Offer, then a collapsed "Closed" column holding Rejected and Ghosted (one at
 * a time behind a segmented control once unfolded). The data model keeps all seven stages (shared
 * `TRACKER_STAGES`, whose order also drives the table and the stage timeline).
 */
import {
  Award,
  Bookmark,
  CircleSlash,
  ClipboardCheck,
  Ghost,
  MessagesSquare,
  Send,
  type LucideIcon,
} from 'lucide-react';

import { TRACKER_STAGE_LABELS, TRACKER_STAGES, type TrackerStage } from '@kestrel/shared';

/** Closed for good: folded into "Closed", so the board dwells on what can still move. */
export type ClosedStage = Extract<TrackerStage, 'rejected' | 'ghosted'>;
export const CLOSED_STAGES: readonly ClosedStage[] = ['rejected', 'ghosted'];
export const ACTIVE_STAGES = [
  'saved',
  'applied',
  'oa',
  'interview',
  'offer',
] as const satisfies readonly TrackerStage[];

export type ColumnKey = (typeof ACTIVE_STAGES)[number] | 'closed';

export interface ColumnDef {
  key: ColumnKey;
  label: string;
  /** Stages shown in the column (Outcomes: one at a time, behind a segmented control). */
  stages: readonly TrackerStage[];
}

export const COLUMNS: readonly ColumnDef[] = [
  { key: 'saved', label: 'Saved', stages: ['saved'] },
  { key: 'applied', label: 'Applied', stages: ['applied'] },
  { key: 'oa', label: 'OA / Test', stages: ['oa'] },
  { key: 'interview', label: 'Interview', stages: ['interview'] },
  { key: 'offer', label: 'Offer', stages: ['offer'] },
  { key: 'closed', label: 'Closed', stages: CLOSED_STAGES },
];

/** Cards in "Closed". */
export function closedTotal(counts: Record<TrackerStage, number>): number {
  return CLOSED_STAGES.reduce((n, s) => n + counts[s], 0);
}

/** The "Closed" stage to unfold on: the first one with cards, else Rejected. */
export function firstClosedStage(counts: Record<TrackerStage, number>): ClosedStage {
  return CLOSED_STAGES.find((s) => counts[s] > 0) ?? 'rejected';
}

export const STAGE_LABEL: Record<TrackerStage, string> = TRACKER_STAGE_LABELS;

export const STAGE_ICONS: Record<TrackerStage, LucideIcon> = {
  saved: Bookmark,
  applied: Send,
  oa: ClipboardCheck,
  interview: MessagesSquare,
  offer: Award,
  rejected: CircleSlash,
  ghosted: Ghost,
};

/** Past-tense verb for timelines ("Applied", "Moved to Interview"). */
export function historyLabel(stage: TrackerStage, first: boolean): string {
  if (first) return stage === 'saved' ? 'Saved' : `Added to ${STAGE_LABEL[stage]}`;
  switch (stage) {
    case 'applied':
      return 'Applied';
    case 'rejected':
      return 'Rejected';
    case 'ghosted':
      return 'Moved to Ghosted';
    case 'offer':
      return 'Offer received';
    case 'saved':
    case 'oa':
    case 'interview':
      return `Moved to ${STAGE_LABEL[stage]}`;
  }
}

/** Closed for good (the "Closed" column; the move-on flow applies). */
export function isClosedStage(stage: TrackerStage): stage is ClosedStage {
  return stage === 'rejected' || stage === 'ghosted';
}

export function columnOf(stage: TrackerStage): ColumnKey {
  return isClosedStage(stage) ? 'closed' : stage;
}

/** Stages a reply can move an Applied card to ("Got a reply", USERFLOW §4.2). */
export const REPLY_STAGES: readonly TrackerStage[] = ['oa', 'interview', 'offer', 'rejected'];

export { TRACKER_STAGES };
