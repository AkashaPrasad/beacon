/* eslint-disable react-refresh/only-export-components -- Co-located public hook/context API. */
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router';

import { useMe } from '@/api';
import { suppressCoachMarks } from '@/components/coach-mark';
import { useCommandItems } from '@/components/command-palette/registry';
import { Button } from '@/components/ui/button';
import { springs, tweens, variants } from '@/features/onboarding/lib/motion';
import { cn, usePrefersReducedMotion } from '@kestrel/ui';

import { resolveAnchor, TOUR_STOPS, type TourStop } from './steps';
import {
  markTourDone,
  requestReplay,
  takeReplayRequest,
  tourRun,
  tourStatus,
  useTourRun,
} from './tour-store';

const PAD = 8;
const RADIUS = 14;
const CARD_W = 320;
const GAP = 14;
const MARGIN = 16;

type Rect = { x: number; y: number; width: number; height: number };

/** MOTION §5.20: the outline scales 1.04 → 1 twice over 480 ms (two count-length beats). */
const PULSE = { ...tweens.count, duration: tweens.count.duration * 2 };

function measure(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.left - PAD, y: r.top - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
}

/** Card position: below the anchor if it fits, else above; clamped to the viewport. */
function place(
  target: Rect,
  cardH: number,
): { x: number; y: number; side: 'top' | 'bottom'; arrowX: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(CARD_W, vw - MARGIN * 2);
  const below = target.y + target.height + GAP;
  const side: 'top' | 'bottom' =
    below + cardH <= vh - MARGIN || target.y - GAP - cardH < MARGIN ? 'bottom' : 'top';
  const y = side === 'bottom' ? Math.min(below, vh - cardH - MARGIN) : target.y - GAP - cardH;
  const centre = target.x + target.width / 2;
  const x = Math.max(MARGIN, Math.min(centre - w / 2, vw - w - MARGIN));
  return { x, y: Math.max(MARGIN, y), side, arrowX: Math.max(18, Math.min(centre - x, w - 18)) };
}

/** `useTour()` — start/stop the walkthrough from anywhere ("Show me around"). */
export function useTour() {
  const run = useTourRun();
  const navigate = useNavigate();
  const location = useLocation();
  const start = useCallback(() => {
    if (location.pathname === '/radar') tourRun.start();
    else {
      requestReplay();
      void navigate('/radar');
    }
  }, [location.pathname, navigate]);
  return { active: run.active, index: run.index, start, stop: tourRun.stop };
}

/**
 * The first-run walkthrough on `/radar` (mount once, anywhere on the Radar). Dims the page with an
 * SVG mask and cuts a rounded spotlight around each anchor; the card travels between stops. Starts by
 * itself after onboarding (or when "Show me around" asked for it) once the anchors are on screen.
 */
export function SpotlightTour() {
  const { data: me } = useMe();
  const userId = me?.user.id ?? null;
  const run = useTourRun();
  const location = useLocation();
  const tour = useTour();
  const reduced = usePrefersReducedMotion();
  const titleId = useId();
  const bodyId = useId();
  const maskId = useId().replace(/:/g, '');
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const [stops, setStops] = useState<TourStop[]>([]);
  const [target, setTarget] = useState<Rect | null>(null);
  const [cardH, setCardH] = useState(180);

  useCommandItems(
    () => [
      {
        id: 'tour.start',
        group: 'Actions',
        label: 'Show me around',
        keywords: ['tour', 'help', 'walkthrough', 'guide'],
        perform: () => tour.start(),
      },
    ],
    [tour.start],
  );

  // Start on the first Radar visit after onboarding, or on a replay request, once anchors exist.
  useEffect(() => {
    if (!userId) return undefined;
    const replay = takeReplayRequest() || new URLSearchParams(location.search).get('tour') === '1';
    if (!replay && tourStatus(userId) !== 'pending') return undefined;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      const available = TOUR_STOPS.filter((s) => resolveAnchor(s));
      const rowsReady = Boolean(
        document.querySelector('[data-testid="radar-row"], [data-testid="radar-card"]'),
      );
      if ((rowsReady && available.length >= 3) || tries > 40) {
        window.clearInterval(timer);
        if (available.length > 0) tourRun.start();
      }
    }, 150);
    return () => window.clearInterval(timer);
  }, [userId, location.search]);

  // Fix the list of stops when a run starts (so "3 of 8" doesn't change mid-way).
  useEffect(() => {
    if (!run.active) return;
    const frame = requestAnimationFrame(() => setStops(TOUR_STOPS.filter((s) => resolveAnchor(s))));
    return () => cancelAnimationFrame(frame);
  }, [run.active]);

  const stop = stops[run.index] ?? null;
  const finish = useCallback(() => {
    tourRun.stop();
    if (userId) markTourDone(userId);
  }, [userId]);

  // Track the anchor: scroll it into view, then follow scroll/resize/layout changes.
  useLayoutEffect(() => {
    if (!run.active || !stop) return undefined;
    const el = resolveAnchor(stop);
    if (!el) {
      if (run.index < stops.length - 1) tourRun.go(run.index + 1);
      else finish();
      return undefined;
    }
    el.scrollIntoView({
      block: 'center',
      inline: 'nearest',
      behavior: reduced ? 'auto' : 'smooth',
    });
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setTarget(measure(el)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('scroll', update, { passive: true, capture: true });
    window.addEventListener('resize', update, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('scroll', update, { capture: true });
      window.removeEventListener('resize', update);
    };
  }, [finish, reduced, run.active, run.index, stop, stops.length]);

  // Modal behaviour: the app is inert behind the overlay; focus moves into the card and comes back.
  useEffect(() => {
    if (!run.active) return undefined;
    const root = document.getElementById('root');
    restoreFocus.current = document.activeElement as HTMLElement | null;
    root?.setAttribute('inert', '');
    suppressCoachMarks(true);
    return () => {
      suppressCoachMarks(false);
      root?.removeAttribute('inert');
      restoreFocus.current?.focus?.({ preventScroll: true });
    };
  }, [run.active]);

  useEffect(() => {
    if (run.active && stop)
      requestAnimationFrame(() => nextRef.current?.focus({ preventScroll: true }));
  }, [run.active, run.index, stop]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  }, [run.index, stop, target?.width]);

  if (!run.active || !stop || typeof document === 'undefined') return null;

  const last = run.index >= stops.length - 1;
  const next = () => (last ? finish() : tourRun.go(run.index + 1));
  const back = () => run.index > 0 && tourRun.go(run.index - 1);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      finish();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      back();
    } else if (e.key === 'Tab') {
      // Trap focus in the card.
      const items = [
        ...(cardRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? []),
      ];
      if (items.length === 0) return;
      const i = items.indexOf(document.activeElement as HTMLElement);
      const to = e.shiftKey
        ? i <= 0
          ? items.length - 1
          : i - 1
        : i === items.length - 1
          ? 0
          : i + 1;
      e.preventDefault();
      items[to]?.focus();
    }
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rect = target ?? { x: vw / 2 - 40, y: vh / 2 - 40, width: 80, height: 80 };
  const pos = place(rect, cardH);
  const move = reduced ? { duration: 0 } : springs.smooth;

  return createPortal(
    <div
      className="fixed inset-0 z-coachmark"
      data-testid="tour"
      data-stop={stop.id}
      onKeyDown={onKeyDown}
    >
      <svg className="absolute inset-0 size-full" aria-hidden="true" onClick={finish}>
        <defs>
          <mask id={maskId}>
            <rect width="100%" height="100%" fill="white" />
            <m.rect initial={false} animate={rect} transition={move} rx={RADIUS} fill="black" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="var(--color-scrim)" mask={`url(#${maskId})`} />
        <m.rect
          key={stop.id}
          initial={false}
          animate={{ ...rect, scale: reduced ? 1 : [1.04, 1, 1.04, 1] }}
          transition={{ ...move, scale: reduced ? { duration: 0 } : PULSE }}
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          rx={RADIUS}
          fill="none"
          stroke="var(--color-accent-strong)"
          strokeWidth={2}
        />
      </svg>

      <m.div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        initial={false}
        animate={{ x: pos.x, y: pos.y }}
        transition={move}
        style={{ width: Math.min(CARD_W, vw - MARGIN * 2) }}
        className="e3 absolute top-0 left-0 rounded-xl border border-border-subtle p-4"
        data-testid="tour-card"
      >
        <span
          aria-hidden="true"
          className={cn(
            'absolute size-3 rotate-45 border-border-subtle bg-overlay',
            pos.side === 'bottom' ? '-top-1.5 border-t border-l' : '-bottom-1.5 border-r border-b',
          )}
          style={{ left: pos.arrowX - 6 }}
        />
        <AnimatePresence initial={false} mode="popLayout">
          <m.div
            key={stop.id}
            variants={variants.fade}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex flex-col gap-1.5"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id={titleId} className="font-display text-h3 text-fg">
                {stop.title}
              </h2>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={finish}
                aria-label="Skip tour"
                data-testid="tour-skip"
              >
                <X className="size-4" strokeWidth={1.5} aria-hidden="true" />
              </Button>
            </div>
            <p id={bodyId} className="text-body text-fg-secondary">
              {stop.body}
            </p>
          </m.div>
        </AnimatePresence>
        <div className="mt-4 flex items-center gap-2">
          <span
            className="flex-1 font-mono text-mono-sm text-fg-tertiary tabular-nums"
            aria-live="polite"
            data-testid="tour-position"
          >
            {run.index + 1} of {stops.length}
          </span>
          {run.index > 0 && (
            <Button variant="ghost" size="sm" onClick={back} data-testid="tour-back">
              <ArrowLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />
              Back
            </Button>
          )}
          <Button ref={nextRef} variant="primary" size="sm" onClick={next} data-testid="tour-next">
            {last ? 'Done' : 'Next'}
            {!last && <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden="true" />}
          </Button>
        </div>
      </m.div>
      <p className="sr-only" aria-live="polite">
        {`Tour, ${run.index + 1} of ${stops.length}: ${stop.title}`}
      </p>
    </div>,
    document.body,
  );
}
