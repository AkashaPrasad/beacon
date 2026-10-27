/**
 * Board view model (radar "Board", key `3`): the same ranked listings, grouped into one column per
 * opportunity type (in the shared type order), each column in feed order. Columns cap the cards they
 * mount (non-virtualised lists, MOTION §5.5 layout limit), with "Show more" in steps.
 */
import type { FeedItemDTO } from '@/api/types';
import { OPPORTUNITY_TYPES, type OpportunityType } from '@kestrel/shared';


export const BOARD_PAGE = 30;

export interface BoardColumn {
  type: OpportunityType;
  items: FeedItemDTO[];
}

export function boardColumns(items: readonly FeedItemDTO[]): BoardColumn[] {
  const byType = new Map<OpportunityType, FeedItemDTO[]>();
  for (const item of items) {
    const list = byType.get(item.listing.type);
    if (list) list.push(item);
    else byType.set(item.listing.type, [item]);
  }
  return OPPORTUNITY_TYPES.filter((type) => byType.has(type)).map((type) => ({ type, items: byType.get(type)! }));
}

/** Keyboard order on the board: column by column, top to bottom, only the cards that are mounted. */
export function boardOrder(columns: readonly BoardColumn[], limits: Readonly<Partial<Record<OpportunityType, number>>>): string[] {
  return columns.flatMap((column) =>
    column.items.slice(0, limits[column.type] ?? BOARD_PAGE).map((item) => item.listing.id),
  );
}
