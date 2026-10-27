/**
 * Keyboard shortcut registry (DESIGN §11, WCAG 2.1.4).
 *
 *   useShortcut('mod+k', openPalette, { description: 'Command palette', group: 'General' });
 *   useShortcut('j', next, { scope: 'radar', description: 'Next row', group: 'Radar' });
 *   useShortcut('g r', () => navigate('/radar'), { description: 'Go to Radar', group: 'Go to' });
 *   useShortcutScope('radar');   // while a screen is mounted, its scope is active
 *
 * Keys: combos use `+` (`mod+k`, `shift+j`, `mod+enter`), sequences use a space (`g r`, max 1 s apart).
 * `mod` = ⌘ on Apple platforms, Ctrl elsewhere. Single printable keys never fire while focus is in a
 * text field, and can be switched off in Settings (`setSingleKeyShortcutsEnabled(false)`).
 * Matching order: active screen scopes (most recently activated first), then `global`.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';

import { readJson, STORAGE_KEYS, writeJson } from './storage';

export type ShortcutScope = 'global' | (string & {});

export interface ShortcutOptions {
  /** Shown in the `?` sheet and the palette. Omit to hide from the sheet. */
  description?: string;
  /** Group heading in the `?` sheet ("General", "Go to", "Radar"…). */
  group?: string;
  scope?: ShortcutScope;
  /** Fire even when focus is in an input/textarea/contenteditable (default: only for `mod+…` and Escape). */
  allowInInput?: boolean;
  /** Fire while focus is inside an open dialog (default false, except `mod+k`). */
  allowInDialog?: boolean;
  /** Default true. */
  preventDefault?: boolean;
  enabled?: boolean;
}

export interface ShortcutDefinition extends Required<Pick<ShortcutOptions, 'scope'>> {
  id: number;
  keys: string;
  description?: string;
  group?: string;
  allowInInput: boolean;
  allowInDialog: boolean;
  preventDefault: boolean;
  /** No modifier: a single printable key or a sequence of them. */
  singleKey: boolean;
  handler: (event: KeyboardEvent) => void;
}

interface Chord {
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

const SEQUENCE_TIMEOUT_MS = 1000;
const SHIFT_INSENSITIVE = /^[^a-z0-9]$/; // "?", "/", "[", "]", ",", "." … already imply shift state

const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  return: 'enter',
  space: ' ',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  slash: '/',
  comma: ',',
  period: '.',
};

function parseChord(token: string): Chord {
  const parts = token.toLowerCase().split('+');
  // "mod++" (plus key) edge case is not used; keep simple.
  const key = parts.pop() ?? '';
  return {
    key: KEY_ALIASES[key] ?? key,
    mod: parts.includes('mod') || parts.includes('meta') || parts.includes('ctrl') || parts.includes('cmd'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt') || parts.includes('option'),
  };
}

export function parseKeys(keys: string): Chord[] {
  return keys.trim().split(/\s+/).map(parseChord);
}

export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /mac|iphone|ipad|ipod/i.test(navigator.platform) || /Mac OS X/.test(navigator.userAgent);
}

function eventKey(event: KeyboardEvent): string {
  const key = event.key.toLowerCase();
  return key === 'spacebar' ? ' ' : key;
}

function matchesChord(event: KeyboardEvent, chord: Chord, apple: boolean): boolean {
  const mod = apple ? event.metaKey : event.ctrlKey;
  if (chord.mod !== mod) return false;
  // On Apple, Ctrl is never part of our shortcuts; elsewhere Meta isn't.
  if (apple ? event.ctrlKey : event.metaKey) return false;
  if (chord.alt !== event.altKey) return false;
  const key = eventKey(event);
  if (!SHIFT_INSENSITIVE.test(chord.key) && chord.shift !== event.shiftKey) return false;
  return key === chord.key;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(type);
  }
  return target.getAttribute('role') === 'combobox' || target.getAttribute('role') === 'textbox';
}

function inDialog(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('[role="dialog"], [role="alertdialog"]'));
}

export class ShortcutRegistry {
  private defs: ShortcutDefinition[] = [];
  private scopes: { scope: string; token: number }[] = [];
  private nextId = 1;
  private pending: { chords: Chord[]; at: number } | null = null;
  private listeners = new Set<() => void>();
  private snapshot: readonly ShortcutDefinition[] = [];
  private singleKeyEnabled = readJson<{ singleKey?: boolean }>(STORAGE_KEYS.shortcuts, {}).singleKey !== false;
  apple = isApplePlatform();

  register(keys: string, handler: (event: KeyboardEvent) => void, options: ShortcutOptions = {}): () => void {
    const chords = parseKeys(keys);
    const def: ShortcutDefinition = {
      id: this.nextId++,
      keys,
      handler,
      description: options.description,
      group: options.group,
      scope: options.scope ?? 'global',
      allowInInput: options.allowInInput ?? chords.every((c) => c.mod || c.key === 'escape'),
      allowInDialog: options.allowInDialog ?? false,
      preventDefault: options.preventDefault ?? true,
      singleKey: chords.every((c) => !c.mod && !c.alt),
    };
    this.defs.push(def);
    this.emit();
    return () => {
      this.defs = this.defs.filter((d) => d.id !== def.id);
      this.emit();
    };
  }

  /** Activate a scope (returns a release function). Later activations take priority. */
  activateScope(scope: string): () => void {
    const token = this.nextId++;
    this.scopes.push({ scope, token });
    this.emit();
    return () => {
      this.scopes = this.scopes.filter((s) => s.token !== token);
      this.emit();
    };
  }

  get activeScopes(): string[] {
    return [...this.scopes].reverse().map((s) => s.scope);
  }

  setSingleKeyEnabled(enabled: boolean): void {
    this.singleKeyEnabled = enabled;
    writeJson(STORAGE_KEYS.shortcuts, { singleKey: enabled });
    this.emit();
  }

  get isSingleKeyEnabled(): boolean {
    return this.singleKeyEnabled;
  }

  /** Visible definitions (with descriptions) for the `?` sheet, deduplicated by keys + scope. */
  list(): readonly ShortcutDefinition[] {
    return this.snapshot;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit() {
    const seen = new Set<string>();
    this.snapshot = this.defs.filter((d) => {
      if (!d.description) return false;
      const key = `${d.scope}:${d.keys}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    this.listeners.forEach((l) => l());
  }

  private candidates(): ShortcutDefinition[] {
    const order = [...this.activeScopes, 'global'];
    const byScope = (scope: string) => this.defs.filter((d) => d.scope === scope).reverse();
    return order.flatMap(byScope);
  }

  /** Returns true when a shortcut handled the event. */
  handleKeyDown = (event: KeyboardEvent): boolean => {
    // Held keys repeat only for single-key navigation (j/k); combos fire once per press.
    if (event.defaultPrevented || event.isComposing) return false;
    if (['shift', 'meta', 'control', 'alt'].includes(eventKey(event))) return false;

    const editable = isEditableTarget(event.target);
    const dialog = inDialog(event.target);
    const now = Date.now();
    const pending = this.pending && now - this.pending.at < SEQUENCE_TIMEOUT_MS ? this.pending : null;
    this.pending = null;

    const allowed = (def: ShortcutDefinition) =>
      (!editable || def.allowInInput) &&
      (!dialog || def.allowInDialog) &&
      (!def.singleKey || this.singleKeyEnabled || editable);

    let startsSequence = false;
    for (const def of this.candidates()) {
      if (!allowed(def)) continue;
      const chords = parseKeys(def.keys);
      if (pending) {
        const prefix = pending.chords;
        if (chords.length === prefix.length + 1 && matchesChord(event, chords[chords.length - 1]!, this.apple)) {
          const prefixMatches = prefix.every(
            (c, i) => chords[i]?.key === c.key && chords[i]?.mod === c.mod && chords[i]?.shift === c.shift,
          );
          if (prefixMatches) return this.fire(def, event);
        }
        continue;
      }
      if (chords.length === 1 && matchesChord(event, chords[0]!, this.apple)) {
        if (event.repeat && !def.singleKey) continue;
        return this.fire(def, event);
      }
      if (chords.length > 1 && matchesChord(event, chords[0]!, this.apple)) startsSequence = true;
    }

    if (startsSequence) {
      this.pending = { chords: [parseChord(event.key.toLowerCase())], at: now };
      return true;
    }
    return false;
  };

  private fire(def: ShortcutDefinition, event: KeyboardEvent): boolean {
    if (def.preventDefault) event.preventDefault();
    def.handler(event);
    return true;
  }

  /** Test helper. */
  reset(): void {
    this.defs = [];
    this.scopes = [];
    this.pending = null;
    this.singleKeyEnabled = true;
    this.emit();
  }
}

export const shortcuts = new ShortcutRegistry();

let installed = false;
/** Attach the single document-level listener (idempotent). Called by AppProviders. */
export function installShortcutListener(target: Document | Window = document): () => void {
  if (installed) return () => undefined;
  installed = true;
  const onKeyDown = (e: Event) => void shortcuts.handleKeyDown(e as KeyboardEvent);
  target.addEventListener('keydown', onKeyDown);
  return () => {
    installed = false;
    target.removeEventListener('keydown', onKeyDown);
  };
}

/**
 * Register a shortcut for the lifetime of the component. The latest `handler` is always called
 * (no need to memoise it).
 */
export function useShortcut(keys: string, handler: (event: KeyboardEvent) => void, options: ShortcutOptions = {}) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  const { description, group, scope, allowInInput, allowInDialog, preventDefault, enabled = true } = options;
  useEffect(() => {
    if (!enabled) return undefined;
    return shortcuts.register(keys, (event) => ref.current(event), {
      description,
      group,
      scope,
      allowInInput,
      allowInDialog,
      preventDefault,
    });
  }, [keys, description, group, scope, allowInInput, allowInDialog, preventDefault, enabled]);
}

/** Activate a scope while mounted (e.g. `useShortcutScope('radar')` in the Radar screen). */
export function useShortcutScope(scope: string, enabled = true) {
  useEffect(() => (enabled ? shortcuts.activateScope(scope) : undefined), [scope, enabled]);
}

/** Live list of described shortcuts (for the `?` sheet). */
export function useShortcutList(): readonly ShortcutDefinition[] {
  return useSyncExternalStore(shortcuts.subscribe, () => shortcuts.list(), () => shortcuts.list());
}

/** `aria-keyshortcuts` value for a key string ("mod+k" → "Meta+K" / "Control+K"). */
export function ariaKeyShortcuts(keys: string, apple = shortcuts.apple): string {
  return keys
    .trim()
    .split(/\s+/)
    .map((step) =>
      step
        .split('+')
        .map((k) => {
          const t = k.toLowerCase();
          if (t === 'mod') return apple ? 'Meta' : 'Control';
          if (t === 'shift') return 'Shift';
          if (t === 'alt') return 'Alt';
          if (t === 'enter') return 'Enter';
          if (t === 'escape' || t === 'esc') return 'Escape';
          return t.length === 1 ? t.toUpperCase() : k;
        })
        .join('+'),
    )
    .join(' ');
}
