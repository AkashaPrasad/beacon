const APPLE: Record<string, string> = { mod: '⌘', meta: '⌘', shift: '⇧', alt: '⌥', ctrl: '⌃' };
const OTHER: Record<string, string> = {
  mod: 'Ctrl',
  meta: 'Win',
  shift: 'Shift',
  alt: 'Alt',
  ctrl: 'Ctrl',
};
const NAMED: Record<string, string> = {
  enter: '↵',
  escape: 'Esc',
  esc: 'Esc',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  backspace: '⌫',
  space: 'Space',
  tab: 'Tab',
  slash: '/',
};

/** Display label for one key token ("mod" → "⌘" on Apple, "Ctrl" elsewhere). */
export function keyLabel(token: string, apple: boolean): string {
  const t = token.toLowerCase();
  return (apple ? APPLE[t] : OTHER[t]) ?? NAMED[t] ?? (t.length === 1 ? t.toUpperCase() : token);
}
