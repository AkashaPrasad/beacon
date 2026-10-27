/**
 * Ghost detection + tracker nudges, revealed in view (transform/opacity only). Left: a listing greys
 * out as the stamps land and the verdict appears. Right: a card slides Applied → Interview on a mini
 * board and a nudge arrives. Reduced motion: final frames.
 */
import { AlertTriangle, ArrowRight, Clock, Link2Off, Repeat2 } from 'lucide-react';
import { m, useInView } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import { Eyebrow } from '@/features/marketing/components/Atmosphere';
import { cn } from '@/lib/utils';
import {
  CompanyLogo,
  FitRing,
  GhostRiskBadge,
  springs,
  tweens,
  usePrefersReducedMotion,
} from '@kestrel/ui';

import { SIGNALS } from '../copy';

const STAMP_ICONS = [Clock, Repeat2, Link2Off] as const;

function GhostCard() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduced = usePrefersReducedMotion();
  const [stage, setStage] = useState(reduced ? 4 : 0);
  useEffect(() => {
    if (!inView || reduced) return undefined;
    const timers = [1, 2, 3, 4].map((s) => setTimeout(() => setStage(s), 500 + s * 520));
    return () => timers.forEach(clearTimeout);
  }, [inView, reduced]);
  const faded = stage >= 4;
  return (
    <div ref={ref} className="mk-panel mk-rim relative p-4 md:p-5">
      <div
        className={cn(
          'flex items-center gap-3 transition-[filter,opacity] duration-slow ease-out',
          faded && 'opacity-60 grayscale',
        )}
      >
        <CompanyLogo name={SIGNALS.ghost.company} domain="lotus.example" size={40} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-body font-medium text-fg">{SIGNALS.ghost.title}</span>
          <span className="truncate text-small text-fg-secondary">
            {SIGNALS.ghost.company} · {SIGNALS.ghost.meta}
          </span>
        </span>
        <FitRing score={54} size={40} label="below" />
      </div>
      <ul className="mt-5 flex flex-wrap gap-2" aria-label="Ghost signals">
        {SIGNALS.ghost.stamps.map((s, i) => {
          const Icon = STAMP_ICONS[i] ?? Clock;
          const on = stage > i;
          return (
            <m.li
              key={s}
              initial={reduced ? false : { opacity: 0, scale: 1.25, rotate: -4 }}
              animate={on ? { opacity: 1, scale: 1, rotate: i % 2 ? 1.5 : -1.5 } : {}}
              transition={springs.release}
              className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-warning/40 bg-warning-subtle px-2 font-mono text-mono-sm text-fg"
            >
              <Icon className="size-3.5 text-warning" strokeWidth={1.75} aria-hidden="true" />
              {s}
            </m.li>
          );
        })}
      </ul>
      <m.div
        initial={reduced ? false : { opacity: 0, y: 6 }}
        animate={faded ? { opacity: 1, y: 0 } : {}}
        transition={springs.snappy}
        className="mt-4 flex items-center justify-between gap-3 border-t border-border-subtle pt-3"
      >
        <GhostRiskBadge level="high" />
        <span className="text-small text-fg-secondary">Score capped · hidden from alerts</span>
      </m.div>
    </div>
  );
}

const COLS = ['Applied', 'Interview', 'Offer'] as const;

function TrackerBoard() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduced = usePrefersReducedMotion();
  const [moved, setMoved] = useState(reduced);
  const [nudge, setNudge] = useState(reduced);
  useEffect(() => {
    if (!inView || reduced) return undefined;
    const a = setTimeout(() => setMoved(true), 900);
    const b = setTimeout(() => setNudge(true), 1700);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [inView, reduced]);
  const card = (title: string, company: string, days: string, cls?: string) => (
    <div className={cn('rounded-md border border-border bg-surface-raised p-2.5 shadow-sm', cls)}>
      <p className="truncate text-small font-medium text-fg">{title}</p>
      <p className="truncate text-caption text-fg-tertiary">
        {company} · {days}
      </p>
    </div>
  );
  return (
    <div ref={ref} className="mk-panel mk-rim relative overflow-hidden p-4 md:p-5">
      <div className="grid grid-cols-3 gap-3">
        {COLS.map((c, i) => (
          <div key={c} className="flex min-h-40 flex-col gap-2 rounded-lg bg-surface-sunken/60 p-2">
            <p className="flex items-center justify-between px-1 text-label text-fg-tertiary uppercase">
              {c}
              <span className="font-mono">
                {i === 0 ? (moved ? 1 : 2) : i === 1 ? (moved ? 2 : 1) : 1}
              </span>
            </p>
            {i === 0 && card('Backend Intern (Go)', 'Coral Stack', '4d')}
            {i === 1 && card('ML Research Intern', 'Meridian AI Lab', '12d')}
            {i === 2 && card('SDE Intern, Payments', 'Saffron Pay', 'offer')}
            {i === 0 && !moved && (
              <div className="h-14 rounded-md border border-dashed border-border-subtle" />
            )}
          </div>
        ))}
      </div>
      {/* The moving card: a layout animation between the two column slots. */}
      <m.div
        layout
        transition={springs.gentle}
        className={cn(
          'absolute w-[calc((100%-2.5rem-1.5rem)/3)]',
          moved
            ? 'top-[7.6rem] left-[calc(1.25rem+(100%-2.5rem+0.75rem)/3)]'
            : 'top-[7.6rem] left-5',
        )}
      >
        {card(
          'Platform Engineering Intern',
          'Northwind Labs',
          '10d',
          moved ? 'border-accent-strong/60' : undefined,
        )}
      </m.div>
      <m.div
        initial={reduced ? false : { opacity: 0, y: 12 }}
        animate={nudge ? { opacity: 1, y: 0 } : {}}
        transition={springs.snappy}
        className="mt-4 flex items-center gap-3 rounded-md border border-accent-strong/30 bg-accent-subtle px-3 py-2.5 text-small text-fg"
      >
        <AlertTriangle
          className="size-4 shrink-0 text-accent-strong"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <span className="flex-1">{SIGNALS.tracker.nudge}</span>
        <span className="inline-flex items-center gap-1 rounded-sm bg-accent px-2 py-1 text-caption font-medium text-accent-fg">
          Follow up <ArrowRight className="size-3" aria-hidden="true" />
        </span>
      </m.div>
    </div>
  );
}

export default function SignalsScene() {
  return (
    <div className="mx-auto grid max-w-content gap-12 px-gutter py-24 md:grid-cols-2 md:gap-16 md:py-32">
      <div className="flex flex-col gap-6">
        <div>
          <Eyebrow>{SIGNALS.eyebrow}</Eyebrow>
          <h2 id="signals-title" className="mk-display-sm mt-3 text-balance text-fg">
            {SIGNALS.title}
          </h2>
          <p className="mk-lede mt-4 max-w-prose text-fg-secondary">{SIGNALS.line}</p>
        </div>
        <m.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ ...springs.smooth, ...tweens.fadeIn }}
        >
          <GhostCard />
        </m.div>
      </div>
      <div className="flex flex-col gap-6">
        <div>
          <Eyebrow>{SIGNALS.tracker.eyebrow}</Eyebrow>
          <h3 className="mk-display-sm mt-3 text-balance text-fg">{SIGNALS.tracker.title}</h3>
          <p className="mk-lede mt-4 max-w-prose text-fg-secondary">{SIGNALS.tracker.line}</p>
        </div>
        <m.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={springs.smooth}
        >
          <TrackerBoard />
        </m.div>
      </div>
    </div>
  );
}
