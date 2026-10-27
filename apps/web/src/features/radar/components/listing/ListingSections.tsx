/**
 * The building blocks of the listing page: why it fits / gaps, tailoring tips (with the AI-off note),
 * eligibility, skills matched and missing, the sanitised description, apply-link health, the ghost
 * check and similar listings. Each is a self-contained card so the page can arrange them in a main
 * column and a side column (one column on phones).
 */
import type { ListingPublic } from '@kestrel/shared';
import { CompanyLogo, DeadlineCountdown, FitRing, formatRelative, ghostLevelOf, GhostRiskBadge, Skeleton, tweens } from '@kestrel/ui';
import { AlertCircle, Check, ChevronDown, CircleCheck, CircleX, Lightbulb } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';

import type { Explanation, ListingDetail } from '@/api/listings';
import { Button } from '@/components/ui/button';
import { readJson, writeJson } from '@/lib/storage';
import { cn } from '@/lib/utils';

import { applyHost, ghostTooltip } from '../../lib/format';

// ── Card / collapsible section ───────────────────────────────────────────────────────────────

const OPEN_KEY = 'beacon:listing:sections';

/** A titled card whose body can be collapsed; the open state is remembered per section. */
export function Card({
  id,
  title,
  children,
  testId,
  collapsible = true,
  defaultOpen = true,
  aside,
  className,
}: {
  id: string;
  title: string;
  children: ReactNode;
  testId?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  aside?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(() => readJson<Record<string, boolean>>(OPEN_KEY, {})[id] ?? defaultOpen);
  const bodyId = useId();
  const toggle = () => {
    const next = !open;
    setOpen(next);
    writeJson(OPEN_KEY, { ...readJson<Record<string, boolean>>(OPEN_KEY, {}), [id]: next });
  };
  return (
    <section data-testid={testId} aria-labelledby={`${bodyId}-title`} className={cn('rounded-lg border border-border bg-surface', className)}>
      <h2 id={`${bodyId}-title`} className="text-label text-fg-tertiary uppercase">
        {collapsible ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={toggle}
            className="flex w-full items-center gap-2 rounded-lg px-4 py-3 text-left hover:text-fg-secondary focus-visible:focus-ring-inset"
          >
            <span className="flex-1">{title}</span>
            {aside}
            <ChevronDown
              className={cn('size-4 transition-transform duration-fast ease-out', !open && '-rotate-90')}
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </button>
        ) : (
          <span className="flex items-center gap-2 px-4 py-3">
            <span className="flex-1">{title}</span>
            {aside}
          </span>
        )}
      </h2>
      <AnimatePresence initial={false}>
        {(open || !collapsible) && (
          <m.div
            id={bodyId}
            key="body"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: tweens.fadeIn }}
            exit={{ opacity: 0, transition: tweens.fadeOut }}
            className="flex flex-col gap-3 px-4 pb-4"
          >
            {children}
          </m.div>
        )}
      </AnimatePresence>
    </section>
  );
}

export function Chip({ children, tone = 'neutral', testId }: { children: ReactNode; tone?: 'neutral' | 'gap' | 'match'; testId?: string }) {
  return (
    <li
      data-testid={testId}
      className={cn(
        'inline-flex min-h-6 max-w-full items-center gap-1 rounded-xs px-2 py-0.5 text-caption',
        tone === 'neutral' && 'bg-surface-sunken text-fg-secondary',
        tone === 'match' && 'bg-fit-good-subtle text-fit-good',
        tone === 'gap' && 'border border-dashed border-border-strong text-fg-secondary',
      )}
    >
      {children}
    </li>
  );
}

// ── Why it fits / gaps / tips ─────────────────────────────────────────────────────────────────

export function WhyAndGaps({
  fit,
  explain,
  loading,
  failed,
  aiEnabled,
}: {
  fit: ListingDetail['fit'];
  explain: Explanation | undefined;
  loading: boolean;
  failed: boolean;
  aiEnabled: boolean;
}) {
  // Rule-based reasons render first; the explain response (AI or cached) replaces them in place.
  const why = (explain?.whyFit.length ? explain.whyFit : (fit?.explain.whyFit ?? [])).slice(0, 3);
  const gaps = (explain?.gaps.length ? explain.gaps : (fit?.explain.gaps ?? [])).slice(0, 2);
  return (
    <div data-testid="drawer-explain" aria-busy={loading} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <h3 className="text-small font-medium text-fg">Why it fits</h3>
        {why.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {why.map((reason) => (
              <Chip key={reason} testId="drawer-why-chip">
                <CircleCheck className="size-3.5 shrink-0 text-fit-good" strokeWidth={1.5} aria-hidden="true" />
                <span className="min-w-0">{reason}</span>
              </Chip>
            ))}
          </ul>
        ) : (
          <p className="text-small text-fg-tertiary">No strong signals yet. Adding skills to your profile helps.</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-small font-medium text-fg">Worth knowing</h3>
        {gaps.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {gaps.map((gap) => (
              <Chip key={gap} tone="gap" testId="drawer-gap-chip">
                <CircleX className="size-3.5 shrink-0 text-fg-tertiary" strokeWidth={1.5} aria-hidden="true" />
                <span className="min-w-0">{gap}</span>
              </Chip>
            ))}
          </ul>
        ) : (
          <p className="text-small text-fg-tertiary">Nothing missing. You cover what this listing asks for.</p>
        )}
      </div>
      {failed && aiEnabled && <p className="text-caption text-fg-tertiary">Couldn&apos;t load AI reasons, so these are the rule-based ones.</p>}
    </div>
  );
}

export function Tips({ explain, loading, aiEnabled }: { explain: Explanation | undefined; loading: boolean; aiEnabled: boolean }) {
  const aiOff = !aiEnabled || explain?.source === 'deterministic';
  return (
    <div data-testid="drawer-tips" className="flex flex-col gap-2 border-t border-border-subtle pt-3">
      <h3 className="text-small font-medium text-fg">Tailor your resume</h3>
      <AnimatePresence mode="popLayout" initial={false}>
        {loading ? (
          <m.div key="loading" exit={{ opacity: 0, transition: tweens.fadeOut }} className="flex flex-col gap-2" aria-label="Loading tips">
            <Skeleton className="h-3 w-11/12" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-2/3" />
          </m.div>
        ) : (
          <m.div key="tips" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: tweens.fadeIn }} className="flex flex-col gap-2">
            {explain?.tailoringTips.length ? (
              <ul className="flex flex-col gap-1.5">
                {explain.tailoringTips.map((tip) => (
                  <li key={tip} className="flex items-start gap-2 text-small text-fg-secondary">
                    <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-xs bg-surface-sunken px-1.5 text-caption text-fg-secondary">
                      <Lightbulb className="size-3" strokeWidth={1.5} aria-hidden="true" />
                      Tip
                    </span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-small text-fg-tertiary">Your profile already covers what this listing asks for.</p>
            )}
            {aiOff && (
              <p data-testid="radar-ai-off-note" className="text-caption text-fg-tertiary">
                AI is off. Scores use embeddings and rules only; tailoring tips are hidden.
                {explain?.tailoringTips.length ? ' These suggestions come from your missing skills.' : ''}
              </p>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Side cards ────────────────────────────────────────────────────────────────────────────────

export function EligibilityList({ detail }: { detail: ListingDetail }) {
  const e = detail.listing.eligibility;
  const rows: [string, string][] = [];
  if (e.gradYears.length) rows.push(['Graduating', e.gradYears.join(', ')]);
  if (e.degrees.length) rows.push(['Degree', e.degrees.join(', ')]);
  if (e.minExperienceYears != null) rows.push(['Experience', `${e.minExperienceYears}+ years`]);
  if (e.citizenship.length) rows.push(['Citizenship', e.citizenship.join(', ')]);
  for (const other of e.other) rows.push(['Also', other]);
  if (!rows.length) return <p data-testid="drawer-eligibility" className="text-small text-fg-secondary">Open to everyone: no restrictions stated.</p>;
  return (
    <dl data-testid="drawer-eligibility" className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 text-small">
      {rows.map(([label, value], i) => (
        <div key={`${label}-${i}`} className="contents">
          <dt className="text-fg-tertiary">{label}</dt>
          <dd className="text-fg-secondary">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SkillsLists({ detail }: { detail: ListingDetail }) {
  if (!detail.matchedSkills.length && !detail.missingSkills.length) {
    return <p className="text-small text-fg-tertiary">This listing doesn&apos;t name specific skills.</p>;
  }
  return (
    <div data-testid="drawer-skills" className="flex flex-col gap-3">
      {detail.matchedSkills.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-caption text-fg-tertiary">You have</p>
          <ul className="flex flex-wrap gap-1">
            {detail.matchedSkills.map((skill) => (
              <Chip key={skill} tone="match">
                <Check className="size-3" strokeWidth={2} aria-hidden="true" />
                {skill}
              </Chip>
            ))}
          </ul>
        </div>
      )}
      {detail.missingSkills.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-caption text-fg-tertiary">Missing</p>
          <ul className="flex flex-wrap gap-1">
            {detail.missingSkills.map((skill) => (
              <Chip key={skill} tone="gap">
                <span aria-hidden="true">–</span>
                <span className="sr-only">Missing </span>
                {skill}
              </Chip>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ApplyHealth({ detail, nowMs }: { detail: ListingDetail; nowMs: number }) {
  const { applyLinkHealth: health, listing } = detail;
  const checked = health.checkedAt ? formatRelative(health.checkedAt, new Date(nowMs)) : null;
  const tone =
    health.status === 'ok'
      ? { icon: CircleCheck, className: 'text-success', word: 'Link works' }
      : health.status === 'unknown'
        ? { icon: AlertCircle, className: 'text-fg-tertiary', word: 'Not checked yet' }
        : health.status === 'redirect_home'
          ? { icon: AlertCircle, className: 'text-warning', word: 'Redirects to the homepage' }
          : { icon: CircleX, className: 'text-danger', word: health.status === 'dead' ? 'Link is dead' : 'Link check failed' };
  const Icon = tone.icon;
  return (
    <div data-testid="drawer-apply-health" className="flex flex-col gap-1 text-small">
      <p className="flex flex-wrap items-center gap-1.5 text-fg-secondary">
        <Icon className={cn('size-4 shrink-0', tone.className)} strokeWidth={1.5} aria-hidden="true" />
        <span className={tone.className}>{tone.word}</span>
        {health.httpStatus != null && <span className="font-mono text-mono-sm text-fg-tertiary">HTTP {health.httpStatus}</span>}
        {checked && <span className="text-fg-tertiary">· checked {checked}</span>}
      </p>
      <p className="truncate font-mono text-mono-sm text-fg-tertiary" title={listing.applyUrl}>
        {applyHost(listing.applyUrl)}
      </p>
    </div>
  );
}

export function GhostCheck({ listing }: { listing: ListingPublic }) {
  const level = ghostLevelOf(listing.ghostRisk.score);
  return (
    <div data-testid="drawer-ghost" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <GhostRiskBadge level={level} showLow />
        <span className="font-mono text-mono-sm text-fg-tertiary">risk {Math.round(listing.ghostRisk.score)}/100</span>
      </div>
      {listing.ghostRisk.reasons.length > 0 ? (
        <ul className="flex flex-col gap-1 text-small text-fg-secondary">
          {listing.ghostRisk.reasons.map((reason) => (
            <li key={reason.code} className="flex items-baseline justify-between gap-3">
              <span>{reason.message}</span>
              <span className="font-mono text-mono-sm text-fg-tertiary">+{reason.points}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-fg-secondary">
          {ghostTooltip(listing.ghostRisk.score, [])} Seen {listing.seenCount}× by Beacon.
        </p>
      )}
    </div>
  );
}

export function SimilarList({
  similar,
  nowMs,
  onOpen,
}: {
  similar: ListingDetail['similar'];
  nowMs: number;
  onOpen: (id: string) => void;
}) {
  if (!similar.length) return null;
  return (
    <ul data-testid="drawer-similar" className="flex flex-col gap-1.5">
      {similar.map(({ listing: s, score }) => (
        <li key={s.id}>
          <button
            type="button"
            onClick={() => onOpen(s.id)}
            className="flex w-full items-center gap-2.5 rounded-md p-2 text-left transition-colors duration-fast hover:bg-surface-hover focus-visible:focus-ring-inset"
          >
            <CompanyLogo name={s.company} domain={s.companyDomain} size={28} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-small font-medium text-fg" title={s.title}>
                {s.title}
              </span>
              <span className="flex min-w-0 items-center gap-1.5 text-caption text-fg-tertiary">
                <span className="truncate">{s.company}</span>
                <span aria-hidden="true">·</span>
                {s.deadlineAt ? (
                  <DeadlineCountdown deadlineAt={s.deadlineAt} now={new Date(nowMs)} />
                ) : (
                  <span className="font-mono text-mono-sm">{s.deadlineKind === 'rolling' ? 'Rolling' : 'No fixed deadline'}</span>
                )}
              </span>
            </span>
            {score != null && <FitRing score={score} size={24} />}
          </button>
        </li>
      ))}
    </ul>
  );
}

// ── Description (sanitised server-side; prose; collapsible) ───────────────────────────────────

const PROSE =
  'max-w-prose text-body text-fg-secondary [&_a]:text-accent-strong [&_a]:underline-offset-3 hover:[&_a]:underline [&_h2]:mt-4 [&_h2]:text-h3 [&_h2]:text-fg [&_h3]:mt-4 [&_h3]:text-h3 [&_h3]:text-fg [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mt-2 [&_strong]:font-semibold [&_strong]:text-fg [&_ul]:list-disc [&_ul]:pl-5 [&>*:first-child]:mt-0';

export function Description({ html, loading, fallback }: { html: string; loading: boolean; fallback: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = html.length > 1600;
  const content = useMemo(() => ({ __html: html }), [html]);
  if (loading && !html) {
    return (
      <div data-testid="drawer-description" className="flex flex-col gap-2">
        <p className="text-body text-fg-secondary">{fallback}</p>
        <Skeleton className="h-3 w-5/6" />
      </div>
    );
  }
  return (
    <div data-testid="drawer-description" className="flex flex-col gap-2">
      <div
        className={cn(PROSE, 'select-text', long && !expanded && 'max-h-96 overflow-hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)]')}
        // Sanitised by the API (sanitize-html allowlist, docs/API.md §6).
        dangerouslySetInnerHTML={content}
      />
      {long && (
        <Button variant="ghost" size="sm" className="self-start" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          <ChevronDown className={cn('transition-transform duration-fast', expanded && 'rotate-180')} strokeWidth={1.5} aria-hidden="true" />
          {expanded ? 'Show less' : 'Read the full description'}
        </Button>
      )}
    </div>
  );
}

// ── "Did you apply?" (USERFLOW §3.2 step 4) ───────────────────────────────────────────────────

export function ApplyReturnPrompt({
  title,
  listingId,
  readPending,
  clearPending,
  windowMs,
  onTrackApplied,
}: {
  title: string;
  listingId: string;
  readPending: () => { id: string; at: number } | null;
  clearPending: () => void;
  windowMs: number;
  onTrackApplied: () => void;
}) {
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const pending = readPending();
      if (pending?.id === listingId && Date.now() - pending.at < windowMs) setAsking(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [listingId, readPending, windowMs]);
  if (!asking) return null;
  return (
    <div role="status" data-testid="drawer-did-apply" className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-raised p-3 text-small text-fg-secondary">
      <p className="w-full">Welcome back. Did you apply to {title}?</p>
      <Button
        size="sm"
        variant="primary"
        onClick={() => {
          clearPending();
          setAsking(false);
          onTrackApplied();
        }}
      >
        Yes, add to my tracker
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          clearPending();
          setAsking(false);
        }}
      >
        Not yet
      </Button>
    </div>
  );
}
