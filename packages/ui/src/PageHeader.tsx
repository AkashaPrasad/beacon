import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import type { ComponentProps, MouseEvent, ReactNode } from 'react';

import { cn } from './cn';

export interface PageHeaderCrumb {
  label: string;
  /** Real URL (so middle-click / copy link work). Omit for the current page (the last crumb). */
  href?: string;
  /** Client-side navigation; called instead of following `href` on a plain click. */
  onNavigate?: () => void;
}

export interface PageHeaderBack {
  /** Where Back goes, in words ("Radar", "Tracker"): the button reads "Back to Radar" to screen readers. */
  label: string;
  onBack: () => void;
  href?: string;
}

export interface PageHeaderPager {
  onPrev?: () => void;
  onNext?: () => void;
  /** "3 of 142" (mono). */
  position?: string;
  prevLabel?: string;
  nextLabel?: string;
}

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
  /** Detail pages: a Back control above the title (goes back in-app, else to the parent). */
  back?: PageHeaderBack;
  /** Detail pages: where this page sits ("Radar / Platform Engineering Intern"). */
  breadcrumbs?: PageHeaderCrumb[];
  /** Detail pages: previous / next item in the list the user came from. */
  pager?: PageHeaderPager;
}

function follow(handler?: () => void) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (!handler || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    handler();
  };
}

const iconButton =
  'press-icon inline-grid size-7 place-items-center rounded-sm text-fg-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-fg focus-visible:focus-ring disabled:pointer-events-none disabled:text-fg-disabled';

/**
 * Page title row: serif title + mono meta on the left, the view toolbar (children) in the middle,
 * actions on the right. Wraps on narrow screens (DESIGN §10.1).
 *
 * Detail variant (page-based navigation): pass `back`, `breadcrumbs` and/or `pager`. A slim row above
 * the title holds Back ("‹ Radar"), the breadcrumb trail (hidden on phones, where Back says enough) and
 * prev/next with the position. Router-free: links take `href` + `onNavigate`.
 */
export function PageHeader({
  title,
  meta,
  actions,
  titleId,
  hideTitle = false,
  back,
  breadcrumbs,
  pager,
  className,
  children,
  ...props
}: PageHeaderProps) {
  const detail = Boolean(back || breadcrumbs?.length || pager);
  return (
    <header
      data-slot="page-header"
      data-variant={detail ? 'detail' : 'page'}
      className={cn('flex flex-col gap-2 px-gutter py-3', className)}
      {...props}
    >
      {detail && (
        <div className="flex min-h-7 items-center gap-2">
          {back && (
            <a
              href={back.href ?? '#'}
              onClick={(e) => {
                // Modified / middle clicks open the parent's real URL in a new tab.
                if (back.href && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)) return;
                e.preventDefault();
                back.onBack();
              }}
              aria-label={`Back to ${back.label}`}
              data-slot="page-back"
              className="press -ml-1.5 inline-flex h-7 shrink-0 items-center gap-0.5 rounded-sm pr-2 pl-1 text-small font-medium text-fg-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-fg focus-visible:focus-ring"
            >
              <ChevronLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />
              <span className="sm:hidden">{back.label}</span>
              <span className="hidden sm:inline">Back</span>
            </a>
          )}
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav aria-label="Breadcrumb" className="hidden min-w-0 sm:block">
              <ol className="flex min-w-0 items-center gap-1 text-small text-fg-tertiary">
                {breadcrumbs.map((crumb, i) => {
                  const last = i === breadcrumbs.length - 1;
                  return (
                    <li key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-1">
                      {i > 0 && (
                        <ChevronRight className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                      )}
                      {crumb.href && !last ? (
                        <a
                          href={crumb.href}
                          onClick={follow(crumb.onNavigate)}
                          className="truncate rounded-xs underline-offset-3 hover:text-fg hover:underline focus-visible:focus-ring"
                        >
                          {crumb.label}
                        </a>
                      ) : (
                        <span className="truncate text-fg-secondary" aria-current={last ? 'page' : undefined}>
                          {crumb.label}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
          )}
          {pager && (
            <div className="ml-auto flex shrink-0 items-center gap-1" data-slot="page-pager">
              {pager.position && (
                <span className="mr-1 font-mono text-mono-sm text-fg-tertiary tabular-nums">{pager.position}</span>
              )}
              <button
                type="button"
                className={iconButton}
                onClick={pager.onPrev}
                disabled={!pager.onPrev}
                aria-label={pager.prevLabel ?? 'Previous'}
                aria-keyshortcuts="K"
              >
                <ChevronUp className="size-4" strokeWidth={1.5} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={iconButton}
                onClick={pager.onNext}
                disabled={!pager.onNext}
                aria-label={pager.nextLabel ?? 'Next'}
                aria-keyshortcuts="J"
              >
                <ChevronDown className="size-4" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      )}
      <div className="flex min-h-8 flex-wrap items-center gap-x-4 gap-y-2">
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
      </div>
    </header>
  );
}
