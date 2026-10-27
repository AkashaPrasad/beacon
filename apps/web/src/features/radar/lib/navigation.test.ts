import { describe, expect, it } from 'vitest';

import {
  cursorIndex,
  feedCommandForKey,
  feedNavReducer,
  initialNavState,
  isEditableTarget,
  neighbourId,
  type FeedNavState,
} from './navigation';

const ids = ['a', 'b', 'c', 'd'];
const at = (cursorId: string | null): FeedNavState => ({ ids, cursorId });

describe('feedNavReducer', () => {
  it('j with no cursor lands on the first row', () => {
    const s = feedNavReducer(feedNavReducer(initialNavState, { type: 'sync', ids }), {
      type: 'move',
      delta: 1,
    });
    expect(s.cursorId).toBe('a');
  });

  it('moves down and up and clamps at both ends (no wrap)', () => {
    let s = at('a');
    s = feedNavReducer(s, { type: 'move', delta: 1 });
    expect(s.cursorId).toBe('b');
    s = feedNavReducer(s, { type: 'move', delta: 10 });
    expect(s.cursorId).toBe('d');
    s = feedNavReducer(s, { type: 'move', delta: 1 });
    expect(s.cursorId).toBe('d');
    s = feedNavReducer(s, { type: 'move', delta: -99 });
    expect(s.cursorId).toBe('a');
    s = feedNavReducer(s, { type: 'move', delta: -1 });
    expect(s.cursorId).toBe('a');
  });

  it('returns the same object when nothing changes (no re-render)', () => {
    const s = at('d');
    expect(feedNavReducer(s, { type: 'move', delta: 1 })).toBe(s);
    expect(feedNavReducer(s, { type: 'focus', id: 'd' })).toBe(s);
  });

  it('first / last', () => {
    expect(feedNavReducer(at('b'), { type: 'first' }).cursorId).toBe('a');
    expect(feedNavReducer(at('b'), { type: 'last' }).cursorId).toBe('d');
  });

  it('focus ignores ids that are not in the feed', () => {
    expect(feedNavReducer(at('b'), { type: 'focus', id: 'zzz' }).cursorId).toBe('b');
    expect(feedNavReducer(at('b'), { type: 'focus', id: 'c' }).cursorId).toBe('c');
    expect(feedNavReducer(at('b'), { type: 'focus', id: null }).cursorId).toBeNull();
  });

  it('keeps the cursor on the same id when a new page appends rows', () => {
    const s = feedNavReducer(at('c'), { type: 'sync', ids: [...ids, 'e', 'f'] });
    expect(s.cursorId).toBe('c');
    expect(cursorIndex(s)).toBe(2);
  });

  it('keeps the cursor on the same id when rows are inserted above it', () => {
    const s = feedNavReducer(at('c'), { type: 'sync', ids: ['new', ...ids] });
    expect(s.cursorId).toBe('c');
  });

  it('remove (hide) moves the cursor to the next row, or the previous at the end', () => {
    const middle = feedNavReducer(at('b'), { type: 'remove', id: 'b' });
    expect(middle).toEqual({ ids: ['a', 'c', 'd'], cursorId: 'c' });
    const last = feedNavReducer(at('d'), { type: 'remove', id: 'd' });
    expect(last.cursorId).toBe('c');
    const other = feedNavReducer(at('a'), { type: 'remove', id: 'c' });
    expect(other.cursorId).toBe('a');
    const only = feedNavReducer({ ids: ['x'], cursorId: 'x' }, { type: 'remove', id: 'x' });
    expect(only.cursorId).toBeNull();
  });

  it('sync after the cursor row vanished keeps the position', () => {
    const s = feedNavReducer(at('b'), { type: 'sync', ids: ['a', 'c', 'd'] });
    expect(s.cursorId).toBe('c');
    expect(feedNavReducer(at('d'), { type: 'sync', ids: ['a', 'b'] }).cursorId).toBe('b');
    expect(feedNavReducer(at('d'), { type: 'sync', ids: [] }).cursorId).toBeNull();
  });

  it('neighbourId for drawer prev/next', () => {
    expect(neighbourId(ids, 'b', 1)).toBe('c');
    expect(neighbourId(ids, 'a', -1)).toBeNull();
    expect(neighbourId(ids, 'd', 1)).toBeNull();
    expect(neighbourId(ids, 'zz', 1)).toBeNull();
  });
});

describe('feedCommandForKey', () => {
  const input = document.createElement('input');
  const checkbox = Object.assign(document.createElement('input'), { type: 'checkbox' });
  const div = document.createElement('div');

  it('maps the DESIGN §11 keys', () => {
    expect(feedCommandForKey({ key: 'j' })).toBe('next');
    expect(feedCommandForKey({ key: 'ArrowDown' })).toBe('next');
    expect(feedCommandForKey({ key: 'k' })).toBe('prev');
    expect(feedCommandForKey({ key: 'Enter' })).toBe('open');
    expect(feedCommandForKey({ key: 'o' })).toBe('open');
    expect(feedCommandForKey({ key: 's' })).toBe('save');
    expect(feedCommandForKey({ key: 'h' })).toBe('hide');
    expect(feedCommandForKey({ key: 'a' })).toBe('track');
    expect(feedCommandForKey({ key: '/' })).toBe('search');
    expect(feedCommandForKey({ key: '[' })).toBe('toggleRail');
    expect(feedCommandForKey({ key: '1' })).toBe('viewList');
    expect(feedCommandForKey({ key: '3' })).toBe('viewBoard');
    expect(feedCommandForKey({ key: 'Enter', metaKey: true })).toBe('openApply');
    expect(feedCommandForKey({ key: 'Escape' })).toBe('close');
  });

  it('ignores single keys while typing, but Escape still closes', () => {
    expect(feedCommandForKey({ key: 'j', target: input })).toBeNull();
    expect(feedCommandForKey({ key: 's', target: input })).toBeNull();
    expect(feedCommandForKey({ key: 'Escape', target: input })).toBe('close');
    expect(feedCommandForKey({ key: 'j', target: checkbox })).toBe('next');
    expect(feedCommandForKey({ key: 'j', target: div })).toBe('next');
  });

  it('leaves modified keys to the browser and the palette', () => {
    expect(feedCommandForKey({ key: 's', metaKey: true })).toBeNull();
    expect(feedCommandForKey({ key: 'k', ctrlKey: true })).toBeNull();
    expect(feedCommandForKey({ key: 'j', altKey: true })).toBeNull();
    expect(feedCommandForKey({ key: 'x' })).toBeNull();
  });

  it('detects editable targets', () => {
    const editable = document.createElement('div');
    editable.setAttribute('role', 'textbox');
    expect(isEditableTarget(editable)).toBe(true);
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true);
    expect(isEditableTarget(null)).toBe(false);
  });
});
