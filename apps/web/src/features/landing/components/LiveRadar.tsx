/**
 * L1 hero feed (MOTION §8 L1): the radar assembles itself, then goes live — a new row every
 * `landing.feed.liveInterval` with the beacon ping. Pauses on hover, focus, a hidden tab, off-screen
 * and reduced motion (where a Play button starts it). Hover or focus a row for its fit breakdown.
 * Lazy chunk, mounted after hydration inside the eager frame (which reserves the height).
 */
import { Pause, Play } from 'lucide-react';
import { animate, AnimatePresence, m, useInView, useMotionValue, useTransform } from 'motion/react';
import { useEffect, useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  cn,
  CompanyLogo,
  DeadlineCountdown,
  durations,
  fitAccessibleLabel,
  fitBandOf,
  FitRing,
  GhostRiskBadge,
  landing,
  springs,
  stagger,
  tweens,
  usePrefersReducedMotion,
  variants,
} from '@kestrel/ui';

import {
  COMPONENTS,
  DEFAULT_WEIGHTS,
  DEMO_NOW,
  daysFromNow,
  FEED,
  scoreOf,
  STATS,
  STUDENT,
  type DemoListing,
} from '../data';
import { usePageVisible } from '../lib/hooks';
import { countTween, drawTween, pingTween, timing } from '../lib/timing';

const ROW_H = 64;
const MAX_ROWS = landing.feed.maxRows;
/** One extra row stays mounted under the bottom mask so the outgoing row slides away instead of vanishing. */
const KEEP = MAX_ROWS + 1;
const fmt = new Intl.NumberFormat('en-IN');

interface Slot {
  key: string;
  listing: DemoListing;
  /** Inserted in live mode (assembles in one beat) rather than in the opening sequence. */
  live: boolean;
}

function CountUp({ value, reduced }: { value: number; reduced: boolean }) {
  const mv = useMotionValue(reduced ? value : 0);
  const text = useTransform(mv, (v) => fmt.format(Math.round(v)));
  useEffect(() => {
    if (reduced) {
      mv.set(value);
      return undefined;
    }
    const controls = animate(mv, value, { ...countTween, delay: durations.fast });
    return () => controls.stop();
  }, [mv, value, reduced]);
  return (
    <span className="inline-grid tabular-nums">
      <span aria-hidden="true" className="invisible col-start-1 row-start-1">
        {fmt.format(value)}
      </span>
      <m.span className="col-start-1 row-start-1 text-fg-secondary">{text}</m.span>
    </span>
  );
}

function deadlineOf(l: DemoListing) {
  return l.deadlineDays === null
    ? { at: null, kind: 'rolling' as const }
    : { at: daysFromNow(l.deadlineDays), kind: 'date' as const };
}

interface RowProps {
  slot: Slot;
  index: number;
  assemble: boolean;
  showGhost: boolean;
  open: boolean;
  panelId: string;
  onInspect: (key: string, pin?: boolean) => void;
  onRelease: (key: string) => void;
}

function Row({ slot, index, assemble, showGhost, open, panelId, onInspect, onRelease }: RowProps) {
  const { listing: l } = slot;
  const score = scoreOf(l);
  const delay = timing.heroStart + index * landing.feed.assembleStep;
  const [ringReady, setRingReady] = useState(!assemble);
  useEffect(() => {
    if (ringReady) return undefined;
    const t = setTimeout(() => setRingReady(true), (delay + durations.slow) * 1000);
    return () => clearTimeout(t);
  }, [ringReady, delay]);
  const deadline = deadlineOf(l);
  const from = <T extends object>(value: T) => (assemble ? value : false);

  return (
    <m.li
      className="absolute inset-x-0 top-0 h-16"
      initial={{ y: index * ROW_H }}
      animate={{ y: index * ROW_H }}
      exit={{ opacity: 0, transition: tweens.exit }}
      transition={springs.gentle}
    >
      <m.div
        className="h-full"
        variants={variants.row}
        initial={slot.live ? 'hidden' : false}
        animate="visible"
        custom={0}
      >
        <button
          type="button"
          aria-expanded={open}
          aria-describedby={open ? panelId : undefined}
          onPointerEnter={(e) => e.pointerType === 'mouse' && onInspect(slot.key)}
          onPointerLeave={(e) => e.pointerType === 'mouse' && onRelease(slot.key)}
          onFocus={() => onInspect(slot.key)}
          onBlur={() => onRelease(slot.key)}
          onClick={() => onInspect(slot.key, true)}
          className={cn(
            'relative flex h-full w-full cursor-default items-center gap-3 px-4 text-left transition-colors duration-fast',
            'hover:bg-surface-hover hover:duration-0 focus-visible:focus-ring-inset',
            open && 'bg-surface-hover',
          )}
        >
          <m.span
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-px origin-left bg-border-subtle"
            initial={from({ scaleX: 0 })}
            animate={{ scaleX: 1 }}
            transition={{ ...drawTween, delay }}
          />
          <m.span
            className="shrink-0"
            initial={from({ scale: 0.6, opacity: 0 })}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ ...springs.snappy, delay }}
          >
            <CompanyLogo name={l.company} domain={l.domain} size={28} />
          </m.span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <m.span
              className="truncate text-body"
              initial={from({ clipPath: 'inset(0 100% 0 0)' })}
              animate={{ clipPath: 'inset(0 0% 0 0)' }}
              transition={{ ...drawTween, delay }}
            >
              <span className="font-medium text-fg">{l.title}</span>
              <span className="text-fg-secondary"> · {l.company}</span>
              <span className="sr-only">. {fitAccessibleLabel(score)}. Show why it fits</span>
            </m.span>
            <span className="flex min-w-0 items-center gap-2 text-small text-fg-tertiary">
              <AnimatePresence initial={false}>
                {showGhost && l.ghost && (
                  <m.span
                    key="ghost"
                    className="shrink-0"
                    initial={{ scale: 1.1, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={springs.snappy}
                  >
                    <GhostRiskBadge level={l.ghost} />
                  </m.span>
                )}
              </AnimatePresence>
              <m.span
                className="min-w-0 truncate"
                initial={from({ opacity: 0 })}
                animate={{ opacity: 1 }}
                transition={{ ...tweens.fadeIn, delay: delay + durations.fast }}
              >
                {l.meta}
              </m.span>
              <span className="hidden shrink-0 items-center gap-1 lg:flex" aria-hidden="true">
                {l.why.map((chip, j) => (
                  <m.span
                    key={chip}
                    className="inline-flex h-5 items-center rounded-xs bg-surface-sunken px-1.5 text-caption text-fg-secondary"
                    initial={from({ x: 6, opacity: 0 })}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{
                      ...springs.snappy,
                      delay: delay + durations.fast + (stagger(j, timing.chipStagger) ?? 0),
                    }}
                  >
                    {chip}
                  </m.span>
                ))}
                {l.gaps.slice(0, 1).map((gap) => (
                  <m.span
                    key={gap}
                    className="inline-flex h-5 items-center rounded-xs border border-dashed border-border-strong px-1.5 text-caption text-fg-tertiary"
                    initial={from({ x: 6, opacity: 0 })}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{
                      ...springs.snappy,
                      delay:
                        delay + durations.fast + (stagger(l.why.length, timing.chipStagger) ?? 0),
                    }}
                  >
                    –{gap}
                  </m.span>
                ))}
              </span>
            </span>
          </span>
          <DeadlineCountdown
            deadlineAt={deadline.at}
            kind={deadline.kind}
            now={DEMO_NOW}
            className="w-16 shrink-0 text-right md:w-18"
          />
          <span className="flex w-7 shrink-0 justify-center md:w-16">
            {ringReady ? (
              <FitRing
                score={score}
                size={28}
                label="below"
                animateId={`landing-${slot.key}`}
                className="[&>span+span]:hidden md:[&>span+span]:inline"
              />
            ) : (
              <span
                aria-hidden="true"
                className="size-7 rounded-full border-[3px] border-fit-track md:mb-4.5"
              />
            )}
          </span>
        </button>
      </m.div>
    </m.li>
  );
}

function Breakdown({ listing, index, id }: { listing: DemoListing; index: number; id: string }) {
  const score = scoreOf(listing);
  const band = fitBandOf(score);
  const largest = listing.parts.indexOf(Math.max(...listing.parts));
  // Below the row for the top half of the feed, above it for the bottom half (stays inside the frame).
  const below = index < 3;
  return (
    <m.div
      id={id}
      key={listing.id}
      variants={variants.popover}
      initial="hidden"
      animate="visible"
      exit="exit"
      style={{
        top: below ? 40 + (index + 1) * ROW_H + 4 : 40 + index * ROW_H - 4,
        y: below ? 0 : '-100%',
        transformOrigin: below ? 'top right' : 'bottom right',
      }}
      className="pointer-events-none absolute right-3 z-popover w-[min(18rem,calc(100%-1.5rem))] rounded-lg border border-border bg-overlay p-3 shadow-md"
    >
      <p className="flex items-baseline justify-between gap-2">
        <span className="text-h3 text-fg">Why {score}</span>
        <span className="font-mono text-mono-sm text-fg-tertiary">{band.label}</span>
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {COMPONENTS.map((name, k) => {
          const part = listing.parts[k] ?? 0;
          const max = (DEFAULT_WEIGHTS[k] ?? 0) * 100;
          return (
            <li key={name} className="flex items-center gap-2 text-small">
              <span className="w-20 shrink-0 text-fg-secondary">{name}</span>
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                <m.span
                  className="block h-full origin-left rounded-full"
                  style={{
                    backgroundColor:
                      k === largest ? `var(${band.colorVar})` : 'var(--color-fg-secondary)',
                  }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: max ? Math.min(1, part / max) : 0 }}
                  transition={{ ...springs.data, delay: stagger(k, timing.revealStagger) ?? 0 }}
                />
              </span>
              <span className="w-10 shrink-0 text-right font-mono text-mono-sm text-fg">
                +{part.toFixed(1)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 border-t border-border-subtle pt-2 text-caption text-fg-tertiary">
        Weights: default. Drag them yourself further down.
      </p>
    </m.div>
  );
}

export default function LiveRadar() {
  const reduced = usePrefersReducedMotion();
  const frame = useRef<HTMLDivElement>(null);
  const inView = useInView(frame, { amount: 0.2 });
  const pageVisible = usePageVisible();
  const panelId = useId();
  const [rows, setRows] = useState<Slot[]>(() =>
    FEED.slice(0, MAX_ROWS).map((listing) => ({ key: listing.id, listing, live: false })),
  );
  const [playing, setPlaying] = useState<boolean | null>(null);
  const [hover, setHover] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [stale, setStale] = useState(reduced);
  const [live, setLive] = useState(false);
  const [ping, setPing] = useState(0);
  const [inspect, setInspect] = useState<{ key: string; pinned: boolean } | null>(null);
  const nextIndex = useRef(MAX_ROWS);
  const serial = useRef(0);

  const autoplay = playing ?? !reduced;
  const paused = !autoplay || hover || focusWithin || !pageVisible || !inView;

  useEffect(() => {
    if (stale) return undefined;
    const t = setTimeout(() => setStale(true), timing.staleAt * 1000);
    return () => clearTimeout(t);
  }, [stale]);

  useEffect(() => {
    if (paused) return undefined;
    const wait = live ? landing.feed.liveInterval : timing.liveStart;
    const t = setTimeout(() => {
      const listing = FEED[nextIndex.current % FEED.length]!;
      nextIndex.current += 1;
      serial.current += 1;
      setLive(true);
      setRows((current) =>
        [{ key: `${listing.id}-${serial.current}`, listing, live: true }, ...current].slice(
          0,
          KEEP,
        ),
      );
      if (!reduced) setPing((n) => n + 1);
    }, wait * 1000);
    return () => clearTimeout(t);
  }, [paused, live, rows, reduced]);

  // A pinned breakdown closes on Escape or a press anywhere else.
  useEffect(() => {
    if (!inspect?.pinned) return undefined;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setInspect(null);
    const onDown = (e: PointerEvent) => {
      if (!frame.current?.contains(e.target as Node)) setInspect(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [inspect?.pinned]);

  const onInspect = (key: string, pin = false) =>
    setInspect((current) =>
      pin && current?.key === key && current.pinned
        ? null
        : { key, pinned: pin || (current?.key === key && current.pinned) },
    );
  const onRelease = (key: string) =>
    setInspect((current) => (current?.key === key && !current.pinned ? null : current));

  const inspectedIndex = inspect ? rows.findIndex((r) => r.key === inspect.key) : -1;
  const inspected =
    inspectedIndex >= 0 && inspectedIndex < MAX_ROWS ? rows[inspectedIndex] : undefined;

  return (
    <m.div
      ref={frame}
      className="absolute inset-0 flex flex-col"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={springs.smooth}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setFocusWithin(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocusWithin(false);
      }}
    >
      <div className="flex h-10 shrink-0 items-center gap-2.5 border-b border-border-subtle pr-1.5 pl-4 font-mono text-mono-sm text-fg-tertiary">
        <span className="relative grid size-2 shrink-0 place-items-center" aria-hidden="true">
          <span className="size-2 rounded-full bg-accent text-accent-fg" />
          <AnimatePresence>
            {ping > 0 && (
              <m.span
                key={ping}
                className="absolute size-6 rounded-full border border-accent-strong"
                initial={{ scale: 0.4, opacity: 0.24 }}
                animate={{ scale: 1.6, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={pingTween}
              />
            )}
          </AnimatePresence>
        </span>
        <p className="min-w-0 truncate">
          <span className="hidden sm:inline">Watching </span>
          <CountUp value={STATS.sources} reduced={reduced} /> sources ·{' '}
          <CountUp value={STATS.listings} reduced={reduced} />
          <span className="hidden sm:inline"> open</span> listings
          <span className="hidden md:inline"> · updated {STATS.updated}</span>
        </p>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          aria-label={autoplay ? 'Pause the live demo' : 'Play the live demo'}
          title={autoplay ? 'Pause' : 'Play'}
          onClick={() => setPlaying(!autoplay)}
        >
          {autoplay ? <Pause strokeWidth={1.5} /> : <Play strokeWidth={1.5} />}
        </Button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_bottom,#000_calc(100%-3rem),transparent)]">
        <ul aria-label="Live demo feed" aria-live="off" className="relative h-full">
          <AnimatePresence initial={false}>
            {rows.map((slot, index) => (
              <Row
                key={slot.key}
                slot={slot}
                index={index}
                assemble={!slot.live && !reduced}
                showGhost={stale || slot.live}
                open={inspect?.key === slot.key}
                panelId={panelId}
                onInspect={onInspect}
                onRelease={onRelease}
              />
            ))}
          </AnimatePresence>
        </ul>
      </div>

      <p className="h-8 shrink-0 truncate border-t border-border-subtle px-4 text-caption leading-8 text-fg-tertiary">
        <span className="hidden sm:inline">Ranked for a sample student: </span>
        <span className="sm:hidden">Sample student: </span>
        {STUDENT}
      </p>

      <AnimatePresence>
        {inspected && (
          <Breakdown
            key={inspected.key}
            listing={inspected.listing}
            index={inspectedIndex}
            id={panelId}
          />
        )}
      </AnimatePresence>
    </m.div>
  );
}
