/**
 * Tracker stage presentation (DESIGN §10.4, UX restructure): four active columns, Saved → Applied →
 * OA / Test → Interview, then "More" (Outcomes: Offer, Rejected, Ghosted behind a segmented control,
 * collapsed by default). The data model keeps all seven stages (shared `TRACKER_STAGES`).
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

/** Terminal stages live behind "More" so the board shows the four active columns first. */
export type OutcomeStage = Extract<TrackerStage, 'offer' | 'rejected' | 'ghosted'>;
export const OUTCOME_STAGES: readonly OutcomeStage[] = ['offer', 'rejected', 'ghosted'];
export const ACTIVE_STAGES = ['saved', 'applied', 'oa', 'interview'] as const satisfies readonly TrackerStage[];

export type ColumnKey = (typeof ACTIVE_STAGES)[number] | 'outcomes';

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
  { key: 'outcomes', label: 'Outcomes', stages: OUTCOME_STAGES },
];

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

export function isOutcomeStage(stage: TrackerStage): stage is OutcomeStage {
  return stage === 'offer' || stage === 'rejected' || stage === 'ghosted';
}

/** Closed for good (the move-on flow applies). */
export function isClosedStage(stage: TrackerStage): boolean {
  return stage === 'rejected' || stage === 'ghosted';
}

export function columnOf(stage: TrackerStage): ColumnKey {
  return isOutcomeStage(stage) ? 'outcomes' : stage;
}

/** Stages a reply can move an Applied card to ("Got a reply", USERFLOW §4.2). */
export const REPLY_STAGES: readonly TrackerStage[] = ['oa', 'interview', 'offer', 'rejected'];

export { TRACKER_STAGES };
