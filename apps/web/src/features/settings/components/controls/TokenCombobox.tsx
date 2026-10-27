import { Check, Plus, Search } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import {
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { variants } from '@/features/onboarding/lib/motion';
import { cn } from '@kestrel/ui';

export interface ComboOption {
  value: string;
  label: string;
  /** Optional group heading ("India", "Worldwide"). */
  group?: string;
  /** Extra search terms (aliases). */
  keywords?: readonly string[];
  /** Right-aligned hint ("Frontend"). */
  hint?: string;
}

export interface TokenComboboxProps {
  options: readonly ComboOption[];
  /** Values already chosen: shown with a check, not re-added. */
  selected: readonly string[];
  onSelect: (value: string) => void;
  /** Allow free text ("Add ‘xyz’"). The raw text is passed to `onSelect`. */
  allowCustom?: boolean;
  placeholder?: string;
  /** Visible label id (the combobox is labelled by it). */
  'aria-labelledby'?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  /** Max suggestions rendered (keeps the listbox short and fast). */
  limit?: number;
  disabled?: boolean;
  /** Called with Backspace on an empty input (remove the last token). */
  onBackspaceEmpty?: () => void;
  className?: string;
  inputClassName?: string;
  'data-testid'?: string;
  /** Content rendered before the input inside the field (tokens). */
  children?: ReactNode;
  /** Suggestions to show before the user types (defaults to the first options). */
  emptyQueryOptions?: readonly ComboOption[];
}

function matches(option: ComboOption, q: string): number {
  const label = option.label.toLowerCase();
  if (label === q) return 0;
  if (label.startsWith(q)) return 1;
  if (label.split(/[\s/,(-]+/).some((w) => w.startsWith(q))) return 2;
  if (option.keywords?.some((k) => k.toLowerCase().startsWith(q))) return 3;
  if (label.includes(q)) return 4;
  return -1;
}

/**
 * Searchable combobox for adding tokens (skills, roles, places). ARIA 1.2 combobox with a listbox
 * popup: arrows move the active option, Enter picks it (or adds free text), Esc closes.
 */
export function TokenCombobox({
  options,
  selected,
  onSelect,
  allowCustom = false,
  placeholder = 'Search…',
  limit = 8,
  disabled,
  onBackspaceEmpty,
  className,
  inputClassName,
  children,
  emptyQueryOptions,
  ...aria
}: TokenComboboxProps) {
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [navigated, setNavigated] = useState(false);

  const selectedSet = useMemo(() => new Set(selected.map((s) => s.toLowerCase())), [selected]);
  const q = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!q) return (emptyQueryOptions ?? options).slice(0, limit);
    return options
      .map((o) => ({ o, rank: matches(o, q) }))
      .filter((r) => r.rank >= 0)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, limit)
      .map((r) => r.o);
  }, [q, options, emptyQueryOptions, limit]);

  const exact = results.some((o) => o.label.toLowerCase() === q || o.value.toLowerCase() === q);
  const showCustom = allowCustom && q.length > 0 && !exact && !selectedSet.has(q);
  const items: { key: string; value: string; option?: ComboOption }[] = [
    ...results.map((o) => ({ key: o.value, value: o.value, option: o })),
    ...(showCustom ? [{ key: `custom:${q}`, value: query.trim() }] : []),
  ];
  const activeIndex = items.length === 0 ? -1 : Math.min(active, items.length - 1);
  const expanded = open && items.length > 0;

  function pick(value: string) {
    onSelect(value);
    setQuery('');
    setActive(0);
    setNavigated(false);
    inputRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setNavigated(true);
      setOpen(true);
      setActive((i) => (items.length ? (i + 1) % items.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setNavigated(true);
      setOpen(true);
      setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
    } else if (e.key === 'Enter') {
      const item = items[activeIndex];
      // With an empty query, Enter only picks after arrow navigation; otherwise it bubbles (Continue).
      if (expanded && item && (q.length > 0 || navigated)) {
        e.preventDefault();
        e.stopPropagation();
        if (!selectedSet.has(item.value.toLowerCase())) pick(item.value);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    } else if (e.key === 'Backspace' && query.length === 0) {
      onBackspaceEmpty?.();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  }

  let lastGroup: string | undefined;

  return (
    <div className={cn('relative', className)}>
      <div
        className={cn(
          'flex min-h-control w-full flex-wrap items-center gap-1.5 rounded-sm border border-border-input bg-surface-raised px-2 py-1 transition-colors duration-fast',
          'focus-within:border-focus-ring focus-within:focus-ring',
          aria['aria-invalid'] && 'border-danger',
          disabled && 'opacity-60',
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {children}
        <div className="flex min-w-[8rem] flex-1 items-center gap-1.5">
          <Search className="size-4 shrink-0 text-fg-tertiary" strokeWidth={1.5} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={listId}
            aria-activedescendant={expanded && activeIndex >= 0 ? `${id}-opt-${activeIndex}` : undefined}
            aria-labelledby={aria['aria-labelledby']}
            aria-label={aria['aria-label']}
            aria-describedby={aria['aria-describedby']}
            aria-invalid={aria['aria-invalid'] || undefined}
            data-testid={aria['data-testid']}
            disabled={disabled}
            value={query}
            placeholder={placeholder}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setQuery(e.target.value);
              setActive(0);
              setNavigated(false);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              setOpen(false);
              setNavigated(false);
            }}
            onKeyDown={onKeyDown}
            className={cn(
              'h-8 min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-tertiary',
              'max-sm:text-body-lg',
              inputClassName,
            )}
          />
        </div>
      </div>
      <AnimatePresence>
        {expanded && (
          <m.ul
            id={listId}
            role="listbox"
            aria-label="Suggestions"
            variants={variants.popover}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{ transformOrigin: 'top center' }}
            className="absolute inset-x-0 top-full z-popover mt-1 max-h-72 overflow-y-auto overscroll-contain rounded-lg border border-border bg-overlay p-1 shadow-md"
            // Keep focus in the input while clicking options.
            onMouseDown={(e) => e.preventDefault()}
          >
            {items.map((item, index) => {
              const isSelected = selectedSet.has(item.value.toLowerCase());
              const group = item.option?.group;
              const heading = group && group !== lastGroup ? group : null;
              lastGroup = group;
              return (
                <li key={item.key} role="presentation">
                  {heading && (
                    <div
                      role="presentation"
                      className="px-2 pt-2 pb-1 text-label uppercase text-fg-tertiary first:pt-1"
                    >
                      {heading}
                    </div>
                  )}
                  <div
                    id={`${id}-opt-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    aria-disabled={isSelected || undefined}
                    data-active={index === activeIndex || undefined}
                    onMouseMove={() => setActive(index)}
                    onClick={() => !isSelected && pick(item.value)}
                    className={cn(
                      'flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-body text-fg',
                      'data-[active]:bg-surface-hover',
                      isSelected && 'cursor-default text-fg-tertiary',
                    )}
                  >
                    {item.option ? (
                      <>
                        <span className="min-w-0 flex-1 truncate">{item.option.label}</span>
                        {item.option.hint && (
                          <span className="shrink-0 text-caption text-fg-tertiary">{item.option.hint}</span>
                        )}
                        {isSelected && (
                          <Check className="size-4 shrink-0 text-fg-tertiary" strokeWidth={1.5} aria-label="Added" />
                        )}
                      </>
                    ) : (
                      <>
                        <Plus className="size-4 shrink-0 text-fg-tertiary" strokeWidth={1.5} aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">
                          Add <span className="font-medium">“{item.value}”</span>
                        </span>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </m.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
