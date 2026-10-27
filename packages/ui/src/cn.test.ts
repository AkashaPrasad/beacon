import { describe, expect, it } from 'vitest';

import { cn } from './cn';

describe('cn', () => {
  it('joins truthy class names', () => {
    expect(cn('a', false, null, undefined, 'b', { c: true, d: false })).toBe('a b c');
  });

  it('lets the last conflicting Tailwind utility win', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });

  it('keeps a text colour next to a named type size (primary buttons must not paint ink on ink)', () => {
    expect(cn('text-accent-fg', 'text-body')).toBe('text-accent-fg text-body');
    expect(cn('bg-accent text-accent-fg', 'h-control px-3.5 text-body', 'group')).toContain(
      'text-accent-fg',
    );
  });

  it('still resolves two named sizes to the last one', () => {
    expect(cn('text-caption', 'text-body')).toBe('text-body');
    expect(cn('text-small', 'text-h2')).toBe('text-h2');
  });

  it('still resolves two colours to the last one', () => {
    expect(cn('text-fg', 'text-fg-secondary')).toBe('text-fg-secondary');
  });
});
