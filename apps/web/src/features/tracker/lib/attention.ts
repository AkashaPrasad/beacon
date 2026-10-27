/**
 * "Needs attention" list: the one most relevant nudge per card (lib/nudges), ordered so the
 * decisions that matter most come first: ghosted suggestions, then deadlines, then follow-ups.
 */
import type { TrackerItemDTO } from '@/api/types';

import { computeNudge, type Nudge, type NudgeKind, type Snooze } from './nudges';

export interface AttentionItem {
  item: TrackerItemDTO;
  nudge: Nudge;
}

const PRIORITY: Record<NudgeKind, number> = {
  move_to_ghosted: 0,
  oa_due: 1,
  offer_due: 1,
  follow_up: 2,
  interview_check: 3,
};

export function attentionItems(
  items: readonly TrackerItemDTO[],
  now: Date,
  snoozes: Readonly<Record<string, readonly Snooze[]>> = {},
): AttentionItem[] {
  const out: AttentionItem[] = [];
  for (const item of items) {
    if (item.id.startsWith('optimistic-')) continue;
    const nudge = computeNudge(item, now, snoozes[item.id] ?? []);
    if (nudge) out.push({ item, nudge });
  }
  return out.sort(
    (a, b) =>
      PRIORITY[a.nudge.kind] - PRIORITY[b.nudge.kind] ||
      (a.nudge.kind.endsWith('_due') ? a.nudge.days - b.nudge.days : b.nudge.days - a.nudge.days) ||
      a.item.title.localeCompare(b.item.title),
  );
}
