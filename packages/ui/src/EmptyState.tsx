import type { ComponentProps, ComponentType, ReactNode } from 'react';

import { cn } from './cn';

type IconComponent = ComponentType<{
  className?: string;
  strokeWidth?: number;
  'aria-hidden'?: boolean | 'true';
}>;

export interface EmptyStateProps extends Omit<ComponentProps<'section'>, 'title'> {
  /** A lucide icon component (rendered at 20 px in a 40 px `surface-sunken` tile). */
  icon?: IconComponent;
  /** ≤ 6 words, sentence case, ends with a full stop (DESIGN §8). */
  title: ReactNode;
  /** One sentence, ≤ 20 words. */
  body?: ReactNode;
  /** One primary action (a Button). */
  action?: ReactNode;
  /** At most one secondary action. */
  secondaryAction?: ReactNode;
  /** `page` = full-page empty state with a `display` serif title. */
  variant?: 'inline' | 'page';
  /** Heading level for the title (default 2 for page, 3 inline). */
  headingLevel?: 2 | 3;
}

/** Empty / zero state with a next action (DESIGN §6.1, USERFLOW §6 copy). */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  secondaryAction,
  variant = 'inline',
  headingLevel,
  className,
  ...props
}: EmptyStateProps) {
  const Heading = (headingLevel ?? (variant === 'page' ? 2 : 3)) === 2 ? 'h2' : 'h3';
  return (
    <section
      data-slot="empty-state"
      className={cn(
        'mx-auto flex w-full max-w-prose flex-col items-center gap-3 text-center',
        variant === 'page' ? 'px-gutter py-16' : 'px-4 py-10',
        className,
      )}
      {...props}
    >
      {Icon && (
        <div className="grid size-10 place-items-center rounded-md bg-surface-sunken text-fg-secondary">
          <Icon className="size-5" strokeWidth={1.5} aria-hidden="true" />
        </div>
      )}
      <Heading
        className={cn(
          'text-balance text-fg',
          variant === 'page' ? 'font-display text-display' : 'text-h3',
        )}
      >
        {title}
      </Heading>
      {body && <p className="max-w-prose text-balance text-body text-fg-secondary">{body}</p>}
      {(action || secondaryAction) && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </section>
  );
}
