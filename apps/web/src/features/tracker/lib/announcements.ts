/**
 * Drag-and-drop announcements (DESIGN §9): "Picked up Platform Engineering Intern in Saved, position
 * 2 of 5." / "Moved to Applied, position 1 of 3." / "Dropped in Applied." / "Cancelled; returned to
 * Saved." Positions are 1-based for people; the board model is 0-based.
 */
import type { TrackerStage } from '@kestrel/shared';

import { STAGE_LABEL } from './stages';

export function pickedUp(title: string, stage: TrackerStage, index: number, total: number): string {
  return `Picked up ${title} in ${STAGE_LABEL[stage]}, position ${index + 1} of ${Math.max(total, 1)}.`;
}

export function movedTo(stage: TrackerStage, index: number, total: number): string {
  return `Moved to ${STAGE_LABEL[stage]}, position ${index + 1} of ${Math.max(total, 1)}.`;
}

export function droppedIn(stage: TrackerStage, moved: boolean): string {
  return moved ? `Dropped in ${STAGE_LABEL[stage]}.` : `Dropped in ${STAGE_LABEL[stage]}. Nothing changed.`;
}

export function cancelled(stage: TrackerStage): string {
  return `Cancelled; returned to ${STAGE_LABEL[stage]}.`;
}

export function blocked(direction: 'up' | 'down' | 'left' | 'right'): string {
  if (direction === 'left') return 'Already in the first column.';
  if (direction === 'right') return 'Already in the last column.';
  return direction === 'up' ? 'Already at the top.' : 'Already at the bottom.';
}

/** Instructions read with every card (aria-describedby). */
export const DRAG_INSTRUCTIONS =
  'Press Space to pick up. Use the arrow keys to move between columns and positions, then Space to drop or Escape to cancel. Press M to move without dragging, Enter to open details.';
