import { describe, expect, it } from 'vitest';

import {
  applyServerColumn,
  buildColumns,
  columnCounts,
  describeMove,
  emptyColumns,
  insertItem,
  locate,
  moveItem,
  positionsOf,
  removeItem,
  type BoardColumns,
} from './board';

function board(partial: Partial<BoardColumns>): BoardColumns {
  return { ...emptyColumns(), ...partial };
}

describe('buildColumns', () => {
  it('groups by stage and orders by position, newest first on ties', () => {
    const cols = buildColumns([
      { id: 'b', stage: 'saved', position: 1 },
      { id: 'a', stage: 'saved', position: 0 },
      { id: 'c', stage: 'applied', position: 0, updatedAt: '2026-10-01T00:00:00Z' },
      { id: 'd', stage: 'applied', position: 0, updatedAt: '2026-10-20T00:00:00Z' },
    ]);
    expect(cols.saved).toEqual(['a', 'b']);
    expect(cols.applied).toEqual(['d', 'c']);
    expect(cols.offer).toEqual([]);
  });
});

describe('moveItem', () => {
  const start = board({ saved: ['a', 'b', 'c'], applied: ['x', 'y'] });

  it('reorders inside a column (index counted after removal, like arrayMove)', () => {
    expect(moveItem(start, 'a', 'saved', 2).saved).toEqual(['b', 'c', 'a']);
    expect(moveItem(start, 'c', 'saved', 0).saved).toEqual(['c', 'a', 'b']);
  });

  it('moves across columns at the target index and re-indexes both', () => {
    const next = moveItem(start, 'b', 'applied', 1);
    expect(next.saved).toEqual(['a', 'c']);
    expect(next.applied).toEqual(['x', 'b', 'y']);
    const pos = positionsOf(next);
    expect(pos.get('b')).toEqual({ stage: 'applied', index: 1 });
    expect(pos.get('y')).toEqual({ stage: 'applied', index: 2 });
    expect(pos.get('c')).toEqual({ stage: 'saved', index: 1 });
  });

  it('clamps out-of-range indexes to the ends', () => {
    expect(moveItem(start, 'a', 'applied', 99).applied).toEqual(['x', 'y', 'a']);
    expect(moveItem(start, 'a', 'applied', -4).applied).toEqual(['a', 'x', 'y']);
    expect(moveItem(start, 'a', 'offer', Number.NaN).offer).toEqual(['a']);
  });

  it('returns the same object for a no-op or unknown id', () => {
    expect(moveItem(start, 'a', 'saved', 0)).toBe(start);
    expect(moveItem(start, 'nope', 'applied', 0)).toBe(start);
  });

  it('never mutates its input', () => {
    const snapshot = JSON.stringify(start);
    moveItem(start, 'a', 'applied', 0);
    expect(JSON.stringify(start)).toBe(snapshot);
  });

  it('undo is the inverse move to the original location', () => {
    const from = locate(start, 'b')!;
    const moved = moveItem(start, 'b', 'ghosted', 0);
    const undone = moveItem(moved, 'b', from.stage, from.index);
    expect(undone).toEqual(start);
  });
});

describe('insert / remove', () => {
  it('inserts at the top by default and dedupes an existing id', () => {
    const cols = board({ saved: ['a'], applied: ['n'] });
    expect(insertItem(cols, 'n', 'saved').saved).toEqual(['n', 'a']);
    expect(insertItem(cols, 'n', 'saved').applied).toEqual([]);
  });
  it('removes from whichever column holds it', () => {
    expect(removeItem(board({ offer: ['o', 'p'] }), 'o').offer).toEqual(['p']);
  });
});

describe('applyServerColumn', () => {
  it('adopts the server order and keeps client-only ids at the end', () => {
    const cols = board({ saved: ['tmp', 'a'], applied: ['b', 'c'] });
    const next = applyServerColumn(cols, 'applied', [
      { id: 'c', position: 0 },
      { id: 'a', position: 1 },
      { id: 'b', position: 2 },
    ]);
    expect(next.applied).toEqual(['c', 'a', 'b']);
    expect(next.saved).toEqual(['tmp']);
  });
});

describe('describeMove / counts', () => {
  it('classifies drags', () => {
    expect(describeMove({ stage: 'saved', index: 0 }, { stage: 'saved', index: 0 })).toBe('none');
    expect(describeMove({ stage: 'saved', index: 0 }, { stage: 'saved', index: 2 })).toBe('reorder');
    expect(describeMove({ stage: 'saved', index: 0 }, { stage: 'oa', index: 0 })).toBe('stage');
    expect(describeMove(null, { stage: 'oa', index: 0 })).toBe('none');
  });
  it('counts every column', () => {
    const counts = columnCounts(board({ saved: ['a', 'b'], ghosted: ['g'] }));
    expect(counts.saved).toBe(2);
    expect(counts.ghosted).toBe(1);
    expect(counts.interview).toBe(0);
  });
});
