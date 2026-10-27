import { afterEach, describe, expect, it, vi } from 'vitest';

import { ariaKeyShortcuts, isEditableTarget, parseKeys, ShortcutRegistry } from './shortcuts';

function key(k: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) {
  const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, 'target', { value: target });
  return event;
}

function registry(apple = true) {
  const r = new ShortcutRegistry();
  r.reset();
  r.apple = apple;
  return r;
}

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe('parseKeys', () => {
  it('parses combos and sequences', () => {
    expect(parseKeys('mod+k')).toEqual([{ key: 'k', mod: true, shift: false, alt: false }]);
    expect(parseKeys('g r').map((c) => c.key)).toEqual(['g', 'r']);
    expect(parseKeys('esc')[0]?.key).toBe('escape');
  });
});

describe('ShortcutRegistry', () => {
  it('fires single keys, but never while typing in a field', () => {
    const r = registry();
    const save = vi.fn();
    r.register('s', save);
    expect(r.handleKeyDown(key('s'))).toBe(true);
    const input = document.createElement('input');
    expect(r.handleKeyDown(key('s', {}, input))).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true);
    const checkbox = Object.assign(document.createElement('input'), { type: 'checkbox' });
    expect(isEditableTarget(checkbox)).toBe(false);
  });

  it('lets mod combos through inputs and dialogs only when allowed, using ⌘ on Apple and Ctrl elsewhere', () => {
    const apple = registry(true);
    const palette = vi.fn();
    apple.register('mod+k', palette, { allowInDialog: true });
    const input = document.createElement('input');
    expect(apple.handleKeyDown(key('k', { metaKey: true }, input))).toBe(true);
    expect(apple.handleKeyDown(key('k', { ctrlKey: true }))).toBe(false);

    const other = registry(false);
    other.register('mod+k', palette);
    expect(other.handleKeyDown(key('k', { ctrlKey: true }))).toBe(true);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const inside = document.createElement('button');
    dialog.appendChild(inside);
    expect(other.handleKeyDown(key('k', { ctrlKey: true }, inside))).toBe(false);
    expect(palette).toHaveBeenCalledTimes(2);
  });

  it('handles `g` sequences within one second', () => {
    vi.useFakeTimers();
    const r = registry();
    const goRadar = vi.fn();
    r.register('g r', goRadar);
    expect(r.handleKeyDown(key('g'))).toBe(true);
    expect(r.handleKeyDown(key('r'))).toBe(true);
    expect(goRadar).toHaveBeenCalledTimes(1);

    r.handleKeyDown(key('g'));
    vi.advanceTimersByTime(1500);
    expect(r.handleKeyDown(key('r'))).toBe(false);
    expect(goRadar).toHaveBeenCalledTimes(1);
  });

  it('prefers the most recently activated scope over global', () => {
    const r = registry();
    const global = vi.fn();
    const radar = vi.fn();
    r.register('j', global);
    r.register('j', radar, { scope: 'radar' });
    r.handleKeyDown(key('j'));
    expect(global).toHaveBeenCalledTimes(1);
    const release = r.activateScope('radar');
    r.handleKeyDown(key('j'));
    expect(radar).toHaveBeenCalledTimes(1);
    release();
    r.handleKeyDown(key('j'));
    expect(global).toHaveBeenCalledTimes(2);
  });

  it('matches shifted symbols like `?` without asking for shift', () => {
    const r = registry();
    const sheet = vi.fn();
    r.register('?', sheet);
    expect(r.handleKeyDown(key('?', { shiftKey: true }))).toBe(true);
    expect(sheet).toHaveBeenCalledTimes(1);
  });

  it('can switch single-key shortcuts off (WCAG 2.1.4) and remembers it', () => {
    const r = registry();
    const hide = vi.fn();
    const palette = vi.fn();
    r.register('h', hide);
    r.register('mod+k', palette);
    r.setSingleKeyEnabled(false);
    expect(r.handleKeyDown(key('h'))).toBe(false);
    expect(r.handleKeyDown(key('k', { metaKey: true }))).toBe(true);
    expect(JSON.parse(localStorage.getItem('beacon:shortcuts') ?? '{}')).toEqual({
      singleKey: false,
    });
  });

  it('lists described shortcuts once per scope for the ? sheet, and unregisters cleanly', () => {
    const r = registry();
    const off = r.register('s', () => undefined, {
      description: 'Save',
      group: 'Radar',
      scope: 'radar',
    });
    r.register('s', () => undefined, { description: 'Save', group: 'Radar', scope: 'radar' });
    r.register('x', () => undefined);
    expect(r.list().map((d) => d.keys)).toEqual(['s']);
    off();
    expect(r.list()).toHaveLength(1);
  });
});

describe('ariaKeyShortcuts', () => {
  it('formats for screen readers', () => {
    expect(ariaKeyShortcuts('mod+k', true)).toBe('Meta+K');
    expect(ariaKeyShortcuts('mod+k', false)).toBe('Control+K');
    expect(ariaKeyShortcuts('g r')).toBe('G R');
    expect(ariaKeyShortcuts('shift+j')).toBe('Shift+J');
  });
});
