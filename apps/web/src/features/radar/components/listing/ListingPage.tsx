/**
 * Listing page: `/radar/:listingId` (replaces the side drawer). Two columns on desktop — main: title,
 * company and meta → your fit (breakdown, why it fits, worth knowing, tips) → description; side: the
 * actions card (Apply, Save, Track, Hide) with the deadline and apply-link health, eligibility, skills
 * matched / missing, the ghost check and similar listings. One column on phones with the actions in a
 * sticky bottom bar.
 *
 * The header morphs in from the row (logo, title, ring: View Transition, MOTION §5.6). Back (button,
 * Esc, browser Back) returns to the list with its scroll position and selected row; j/k and ←/→ step
 * through the list the page was opened from; s / h / a / ⌘↵ act on this listing.
 */
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Ban,
  Bookmark,
  BookmarkCheck,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  KanbanSquare,
} from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

import { PENDING_TRACKER_ID, useExplain, useListing, type ListingDetail } from '@/api/listings';
import { rememberRecentListing } from '@/components/command-palette/registry';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { isApiError } from '@/lib/api';
import { useShortcut, useShortcutScope } from '@/lib/shortcuts';
import { useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';
import {
  CompanyLogo,
  DeadlineCountdown,
  EmptyState,
  FitRing,
  fitBandOf,
  formatAbsolute,
  ghostLevelOf,
  GhostRiskBadge,
  Skeleton,
  TypeBadge,
  usePrefersReducedMotion,
} from '@kestrel/ui';

import { FitBreakdown } from './FitBreakdown';
import {
  ApplyHealth,
  ApplyReturnPrompt,
  Card,
  Description,
  EligibilityList,
  GhostCheck,
  SimilarList,
  SkillsLists,
  Tips,
  WhyAndGaps,
} from './ListingSections';
import type { ActionListing, ListingActions } from '../../hooks/useListingActions';
import { locationText, postedText, sourceLabel, stipendText } from '../../lib/format';
import {
  APPLY_WINDOW_MS,
  clearPendingApply,
  readPendingApply,
  rememberApply,
} from '../../lib/listingContext';
import { ECHO_MS, getMorphingId, subscribeMorph, viewTransitionName } from '../../lib/motion';

export interface ListingPageProps {
  listingId: string;
  prevId: string | null;
  nextId: string | null;
  /** "3 of 66" in the header (null when opened outside a list). */
  position: { index: number; total: number } | null;
  backLabel: string;
  onBack: () => void;
  onPrev: () => void;
  onNext: () => void;
  /** Similar listings open in place (replace). */
  onOpenListing: (id: string) => void;
  onHide: (listing: ActionListing) => void;
  actions: ListingActions;
  timeZone: string;
  aiEnabled: boolean;
  nowMs: number;
}

function useMorphingId(): string | null {
  return useSyncExternalStore(subscribeMorph, getMorphingId, () => null);
}

function vt(part: 'logo' | 'title' | 'ring', id: string, morphing: string | null) {
  return morphing === id ? { viewTransitionName: viewTransitionName(part, id) } : undefined;
}

type Echo = 'save' | 'hide' | 'track' | 'apply' | null;

function IconNav({
  label,
  shortcut,
  disabled,
  onClick,
  testId,
  children,
}: {
  label: string;
  shortcut: string;
  disabled: boolean;
  onClick: () => void;
  testId: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-keyshortcuts={shortcut}
          disabled={disabled}
          onClick={onClick}
          data-testid={testId}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        <kbd className="font-mono text-mono-sm">{shortcut}</kbd>
      </TooltipContent>
    </Tooltip>
  );
}

export function ListingPage(props: ListingPageProps) {
  const {
    listingId,
    prevId,
    nextId,
    position,
    backLabel,
    onBack,
    onPrev,
    onNext,
    actions,
    onHide,
    nowMs,
  } = props;
  useShortcutScope('listing');
  const query = useListing(listingId);
  const detail = query.data;
  const morphing = useMorphingId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [echo, setEcho] = useState<Echo>(null);
  const flash = (action: Echo) => {
    setEcho(action);
    setTimeout(() => setEcho(null), ECHO_MS);
  };

  // A new listing: start at the top and move focus to its title (DESIGN §9: a page change).
  useEffect(() => {
    window.scrollTo({ top: 0 });
    titleRef.current?.focus({ preventScroll: true });
  }, [listingId]);
  const listing = detail?.listing;
  useEffect(() => {
    if (listing)
      rememberRecentListing({ id: listing.id, title: listing.title, company: listing.company });
  }, [listing]);

  const current: ActionListing | null = detail
    ? {
        id: detail.listing.id,
        title: detail.listing.title,
        applyUrl: detail.listing.applyUrl,
        saved: detail.saved,
        trackerItemId: detail.trackerItemId,
      }
    : null;
  const closed = Boolean(listing?.deadlineAt && listing.deadlineAt.getTime() < nowMs);
  const keys = { scope: 'listing', group: 'Listing' } as const;
  useShortcut('escape', onBack, { ...keys, description: 'Back to the list' });
  useShortcut('j', onNext, { ...keys, description: 'Next listing', enabled: Boolean(nextId) });
  useShortcut('k', onPrev, { ...keys, description: 'Previous listing', enabled: Boolean(prevId) });
  useShortcut('arrowright', onNext, { scope: 'listing', enabled: Boolean(nextId) });
  useShortcut('arrowleft', onPrev, { scope: 'listing', enabled: Boolean(prevId) });
  const run = (action: Exclude<Echo, null>) => {
    if (!current) return;
    flash(action);
    if (action === 'save') actions.toggleSave(current);
    else if (action === 'hide') onHide(current);
    else if (action === 'track') actions.track(current);
    else if (!closed) {
      rememberApply(current.id);
      actions.apply(current);
    }
  };
  useShortcut('s', () => run('save'), { ...keys, description: 'Save / unsave' });
  useShortcut('h', () => run('hide'), { ...keys, description: 'Hide' });
  useShortcut('a', () => run('track'), { ...keys, description: 'Add to tracker' });
  useShortcut('mod+enter', () => run('apply'), { ...keys, description: 'Open the apply link' });

  const nav = (
    <div className="sticky top-(--topbar-h) z-sticky -mx-gutter flex h-12 items-center gap-2 border-b border-border-subtle bg-surface px-gutter md:mx-0 md:rounded-b-lg md:px-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        data-testid="drawer-close"
        aria-keyshortcuts="Escape"
      >
        <ArrowLeft strokeWidth={1.5} aria-hidden="true" />
        {backLabel}
      </Button>
      <div className="ml-auto flex items-center gap-1">
        {position && position.index >= 0 && (
          <span className="mr-1 font-mono text-mono-sm text-fg-tertiary" aria-live="polite">
            {position.index + 1} of {position.total.toLocaleString('en-IN')}
          </span>
        )}
        <IconNav
          label="Previous listing"
          shortcut="K"
          disabled={!prevId}
          onClick={onPrev}
          testId="drawer-prev"
        >
          <ChevronLeft strokeWidth={1.5} />
        </IconNav>
        <IconNav
          label="Next listing"
          shortcut="J"
          disabled={!nextId}
          onClick={onNext}
          testId="drawer-next"
        >
          <ChevronRight strokeWidth={1.5} />
        </IconNav>
      </div>
    </div>
  );

  return (
    <article
      data-testid="listing-page"
      data-listing-id={listingId}
      aria-labelledby="listing-title"
      className="mx-auto w-full max-w-6xl px-gutter pb-28 md:px-8 md:pb-12"
    >
      {nav}
      <div data-testid="listing-drawer" className="pt-6">
        {query.isError && !detail ? (
          <PageError
            error={query.error}
            onRetry={() => void query.refetch()}
            onBack={onBack}
            backLabel={backLabel}
          />
        ) : !detail ? (
          <PageSkeleton titleRef={titleRef} />
        ) : (
          <PageBody
            {...props}
            detail={detail}
            loadingDetail={query.isPlaceholderData}
            morphing={morphing}
            titleRef={titleRef}
            echo={echo}
            run={run}
            closed={closed}
          />
        )}
      </div>
    </article>
  );
}

function PageError({
  error,
  onRetry,
  onBack,
  backLabel,
}: {
  error: unknown;
  onRetry: () => void;
  onBack: () => void;
  backLabel: string;
}) {
  const missing = isApiError(error) && error.status === 404;
  return (
    <div data-testid="drawer" className="py-10">
      <h1 id="listing-title" data-testid="listing-drawer-title" tabIndex={-1} className="sr-only">
        {missing ? 'Listing unavailable' : "Couldn't load this listing"}
      </h1>
      <EmptyState
        icon={AlertCircle}
        title={missing ? 'This one has gone.' : "Couldn't load this listing."}
        body={
          missing
            ? 'It may have closed or been taken down by its source.'
            : 'Check your connection, then try again.'
        }
        action={
          missing ? (
            <Button variant="primary" onClick={onBack}>
              {backLabel}
            </Button>
          ) : (
            <Button variant="primary" onClick={onRetry}>
              Try again
            </Button>
          )
        }
      />
    </div>
  );
}

function PageSkeleton({ titleRef }: { titleRef: React.RefObject<HTMLHeadingElement | null> }) {
  return (
    <div
      data-testid="drawer"
      aria-busy="true"
      className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem]"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-sm" />
          <Skeleton className="h-3.5 w-40" />
        </div>
        <h1
          id="listing-title"
          ref={titleRef}
          tabIndex={-1}
          data-testid="listing-drawer-title"
          className="outline-none"
        >
          <span className="sr-only">Loading…</span>
          <Skeleton className="h-8 w-3/4" />
        </h1>
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="mt-4 h-48 w-full rounded-lg" />
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}

function PageBody({
  detail,
  loadingDetail,
  morphing,
  titleRef,
  echo,
  run,
  closed,
  timeZone,
  aiEnabled,
  nowMs,
  onOpenListing,
}: ListingPageProps & {
  detail: ListingDetail;
  loadingDetail: boolean;
  morphing: string | null;
  titleRef: React.RefObject<HTMLHeadingElement | null>;
  echo: Echo;
  run: (action: Exclude<Echo, null>) => void;
  closed: boolean;
}) {
  const { listing, fit } = detail;
  const reduced = usePrefersReducedMotion();
  const phone = !useMediaQuery('(min-width: 768px)');
  const explain = useExplain(listing.id, { enabled: Boolean(fit) });
  const now = new Date(nowMs);
  const tracked = Boolean(detail.trackerItemId);
  const ghost = ghostLevelOf(listing.ghostRisk.score);
  const meta = [
    locationText(listing),
    stipendText(listing, { short: false }),
    `posted ${postedText(listing, now)}`,
    `via ${sourceLabel(listing, detail.source)}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const applyButton = (wide: boolean) =>
    closed ? (
      <Button
        variant="primary"
        disabled
        data-testid="drawer-apply"
        className={cn(wide && 'w-full')}
      >
        Closed
      </Button>
    ) : (
      <Button
        variant="primary"
        asChild
        className={cn(wide && 'w-full')}
        data-pressed={echo === 'apply' || undefined}
      >
        <a
          href={listing.applyUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="drawer-apply"
          aria-keyshortcuts="Meta+Enter"
          onClick={() => rememberApply(listing.id)}
        >
          Apply
          <ArrowUpRight strokeWidth={1.5} aria-hidden="true" />
          <span className="sr-only">
            {' '}
            on {sourceLabel(listing, detail.source)} (opens in a new tab)
          </span>
        </a>
      </Button>
    );
  const secondary = (
    <>
      <Button
        variant="secondary"
        data-testid="drawer-save"
        aria-pressed={detail.saved}
        aria-keyshortcuts="S"
        data-pressed={echo === 'save' || undefined}
        onClick={() => run('save')}
        className="flex-1"
      >
        {detail.saved ? (
          <BookmarkCheck className="text-accent-strong" strokeWidth={1.5} />
        ) : (
          <Bookmark strokeWidth={1.5} />
        )}
        {detail.saved ? 'Saved' : 'Save'}
      </Button>
      <Button
        variant="secondary"
        data-testid="drawer-track"
        aria-keyshortcuts="A"
        data-pressed={echo === 'track' || undefined}
        disabled={detail.trackerItemId === PENDING_TRACKER_ID}
        onClick={() => run('track')}
        className="flex-1"
      >
        <KanbanSquare className={cn(tracked && 'text-accent-strong')} strokeWidth={1.5} />
        {tracked ? 'Tracking' : 'Track'}
      </Button>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Hide this listing"
            aria-keyshortcuts="H"
            data-testid="drawer-hide"
            data-pressed={echo === 'hide' || undefined}
            onClick={() => run('hide')}
          >
            <EyeOff strokeWidth={1.5} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Not for me <kbd className="font-mono text-mono-sm">H</kbd>
        </TooltipContent>
      </Tooltip>
    </>
  );

  return (
    <div data-testid="drawer" className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
      {/* ── Main column ── */}
      <div className="flex min-w-0 flex-col gap-6">
        <header className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span style={vt('logo', listing.id, morphing)} className="inline-flex">
              <CompanyLogo name={listing.company} domain={listing.companyDomain} size={40} />
            </span>
            <div className="min-w-0 flex-1">
              <p
                className="truncate text-body font-medium text-fg-secondary"
                title={listing.company}
              >
                {listing.company}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <TypeBadge type={listing.type} />
                {ghost !== 'low' && <GhostRiskBadge level={ghost} />}
              </div>
            </div>
            <span style={vt('ring', listing.id, morphing)} className="inline-flex shrink-0">
              {fit ? (
                <FitRing score={fit.score} size={40} label="right" />
              ) : (
                <span className="text-caption text-fg-tertiary">Ranking…</span>
              )}
            </span>
          </div>
          <h1
            id="listing-title"
            ref={titleRef}
            tabIndex={-1}
            data-testid="listing-drawer-title"
            style={vt('title', listing.id, morphing)}
            className="font-display text-h1 break-words text-fg outline-none"
          >
            {listing.title}
          </h1>
          <p className="text-small text-fg-secondary">{meta}</p>
        </header>

        <ApplyReturnPrompt
          title={listing.title}
          listingId={listing.id}
          readPending={readPendingApply}
          clearPending={clearPendingApply}
          windowMs={APPLY_WINDOW_MS}
          onTrackApplied={() => run('track')}
        />

        <Card
          id="fit"
          title="Your fit"
          testId="listing-fit"
          aside={
            fit ? (
              <span className="font-mono text-mono-sm normal-case">
                {fit.score} · {fitBandOf(fit.score).label}
              </span>
            ) : undefined
          }
        >
          {fit ? (
            <>
              <FitBreakdown fit={fit} animate={!reduced} />
              {fit.hardFails.length > 0 && (
                <p className="flex items-start gap-1.5 text-small text-fg-secondary">
                  <Ban
                    className="mt-0.5 size-4 shrink-0 text-fit-low"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  Not eligible: {fit.hardFails.map((f) => f.reason.replace(/\.$/, '')).join('; ')}
                </p>
              )}
              <div className="border-t border-border-subtle pt-3">
                <WhyAndGaps
                  fit={fit}
                  explain={explain.data}
                  loading={explain.isLoading}
                  failed={explain.isError}
                  aiEnabled={aiEnabled}
                />
              </div>
              <Tips
                explain={explain.data}
                loading={explain.isLoading || (loadingDetail && !explain.data)}
                aiEnabled={aiEnabled}
              />
            </>
          ) : (
            <p className="text-small text-fg-secondary">
              Still ranking this one for you. The breakdown appears as soon as it has a score.
            </p>
          )}
        </Card>

        <Card id="description" title="About the role" testId="listing-description">
          <Description
            html={detail.descriptionHtml}
            loading={loadingDetail}
            fallback={listing.descriptionMd}
          />
        </Card>
      </div>

      {/* ── Side column ── */}
      <aside
        aria-label="Actions and details"
        className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-[calc(var(--topbar-h)+4rem)] lg:self-start"
      >
        <section
          aria-label="Apply"
          className="flex flex-col gap-3 rounded-lg border border-border bg-surface-raised p-4"
        >
          <div className="flex flex-col gap-0.5">
            <p className="text-label text-fg-tertiary uppercase">Deadline</p>
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span
                data-testid="listing-drawer-deadline"
                data-deadline-at={listing.deadlineAt ? listing.deadlineAt.toISOString() : ''}
                data-timezone={timeZone}
                className="font-mono text-mono text-fg"
              >
                {listing.deadlineAt
                  ? formatAbsolute(listing.deadlineAt, timeZone)
                  : listing.deadlineKind === 'rolling'
                    ? 'Rolling'
                    : 'No fixed deadline'}
              </span>
              {listing.deadlineAt && (
                <DeadlineCountdown deadlineAt={listing.deadlineAt} now={now} />
              )}
            </p>
          </div>
          {!phone && (
            <>
              <span data-testid="listing-drawer-apply" className="contents">
                {applyButton(true)}
              </span>
              <div className="flex gap-2">{secondary}</div>
            </>
          )}
          <div className="border-t border-border-subtle pt-3">
            <ApplyHealth detail={detail} nowMs={nowMs} />
          </div>
        </section>

        <Card id="eligibility" title="Who can apply" testId="listing-eligibility">
          <EligibilityList detail={detail} />
        </Card>
        <Card id="skills" title="Skills" testId="listing-skills">
          <SkillsLists detail={detail} />
        </Card>
        <Card
          id="ghost"
          title="Is it still open?"
          testId="listing-ghost"
          defaultOpen={ghost !== 'low'}
        >
          <GhostCheck listing={listing} />
        </Card>
        {detail.similar.length > 0 && (
          <Card id="similar" title="You might also like" testId="listing-similar">
            <SimilarList similar={detail.similar} nowMs={nowMs} onOpen={onOpenListing} />
          </Card>
        )}
      </aside>

      {/* Phones: the actions stay under the thumb. */}
      {phone && (
        <div className="fixed inset-x-0 bottom-[calc(var(--tabbar-h)+var(--safe-bottom))] z-sticky flex items-center gap-2 border-t border-border bg-surface px-gutter py-2">
          <span data-testid="listing-drawer-apply" className="contents">
            {applyButton(false)}
          </span>
          {secondary}
        </div>
      )}
    </div>
  );
}
