import type { ComponentProps, ReactNode } from 'react';

import { cn } from './cn';

export interface PageHeaderProps extends Omit<ComponentProps<'header'>, 'title'> {
  /** Page title (Instrument Serif `h1`). */
  title: ReactNode;
  /** Mono meta next to the title, e.g. "142 fits". */
  meta?: ReactNode;
  /** Right-aligned actions (at most one primary button). */
  actions?: ReactNode;
  /** Id for the h1 (for `aria-labelledby` on the page region). */
  titleId?: string;
  /** Visually hide the title (mobile shows it in the top bar). */
  hideTitle?: boolean;
}

/**
 * Page title row: serif title + mono meta on the left, the view toolbar (children) in the middle,
 * actions on the right. Wraps on narrow screens (DESIGN §10.1).
 */
export function PageHeader({
  title,
  meta,
  actions,
  titleId,
  hideTitle = false,
  className,
  children,
  ...props
}: PageHeaderProps) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        'flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 px-gutter py-3',
        className,
      )}
      {...props}
    >
      <div className={cn('flex min-w-0 items-baseline gap-3', hideTitle && 'sr-only')}>
        <h1 id={titleId} className="truncate font-display text-h1 text-fg">
          {title}
        </h1>
        {meta != null && <span className="font-mono text-mono-sm text-fg-tertiary">{meta}</span>}
      </div>
      {children != null && (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
      )}
      {actions != null && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
