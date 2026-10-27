import { useEffect, useRef, useState, type ComponentProps, type KeyboardEvent } from 'react';

import { cn } from '@kestrel/ui';

export interface InlineTextProps
  extends Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'defaultValue' | 'size'> {
  value: string;
  /** Called on blur or Enter when the trimmed value changed. Esc reverts. */
  onCommit: (value: string) => void;
  /** Visual size of the text. */
  size?: 'body' | 'h2' | 'h1' | 'small';
  /** Render multiline (textarea, commits on blur or ⌘/Ctrl+Enter). */
  multiline?: boolean;
  maxLength?: number;
}

const SIZE: Record<NonNullable<InlineTextProps['size']>, string> = {
  h1: 'font-display text-h1 h-auto py-0.5',
  h2: 'text-h2 h-9',
  body: 'text-body h-8',
  small: 'text-small h-7',
};

/**
 * Read.cv-style inline field: reads as plain text, reveals its outline on hover and focus, commits on
 * blur/Enter and reverts on Esc. Never a modal, never a Save button (DESIGN §6.1 Profile).
 */
export function InlineText({
  value,
  onCommit,
  size = 'body',
  multiline = false,
  className,
  placeholder,
  maxLength,
  ...props
}: InlineTextProps) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Follow external changes (undo, server refresh) unless the user is typing.
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  // Auto-size the textarea to its content (height is set once per change, not animated).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, multiline]);

  function commit() {
    const next = draft.trim();
    if (next !== value.trim()) onCommit(next);
    else setDraft(value);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setDraft(value);
      (e.currentTarget as HTMLElement).blur();
    } else if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      (e.currentTarget as HTMLElement).blur();
    }
  }

  const classes = cn(
    'w-full min-w-0 rounded-sm border border-transparent bg-transparent px-1.5 text-fg -mx-1.5',
    'placeholder:text-fg-tertiary transition-colors duration-fast',
    'hover:border-border focus-visible:border-border-input focus-visible:bg-surface-raised focus-visible:focus-ring',
    'max-sm:text-body-lg',
    SIZE[size],
    multiline && 'resize-none overflow-hidden py-1 leading-[inherit] h-auto',
    className,
  );

  if (multiline) {
    return (
      <textarea
        ref={textareaRef}
        rows={1}
        value={draft}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-label={props['aria-label']}
        aria-labelledby={props['aria-labelledby']}
        aria-describedby={props['aria-describedby']}
        id={props.id}
        data-testid={(props as Record<string, unknown>)['data-testid'] as string | undefined}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          commit();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        className={classes}
      />
    );
  }

  return (
    <input
      type="text"
      {...props}
      value={draft}
      placeholder={placeholder}
      maxLength={maxLength}
      enterKeyHint="done"
      onFocus={(e) => {
        focused.current = true;
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        focused.current = false;
        commit();
        props.onBlur?.(e);
      }}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={onKeyDown}
      className={classes}
    />
  );
}
