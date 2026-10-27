/**
 * L3 deadline timeline sweep (MOTION §8 L3). Desktop: a five-week strip, pinned; scroll moves the strip
 * and a date line sweeps across it, each deadline lighting up as the line reaches its day; then the
 * count rolls in. Phones: a vertical agenda revealed in view. Reduced motion: a static strip.
 */
import { m, useScroll, useTransform, type MotionValue } from 'motion/react';
import { useRef } from 'react';

import { useMediaQuery } from '@/lib/use-media-query';
import {
  cn,
  DeadlineCountdown,
  fitBandOf,
  formatShortDate,
  landing,
  springs,
  stagger,
  TYPE_META,
  usePrefersReducedMotion,
  variants,
} from '@kestrel/ui';

import { Kicker } from '../components/Kicker';
import { TIMELINE } from '../copy';
import { DEMO_NOW, TIMELINE_DAYS, TIMELINE_PILLS, TIMELINE_START, TIMELINE_TODAY } from '../data';
import { fullRange, useElementSize } from '../lib/math';
import { timing } from '../lib/timing';

const DAY_W = 96;
const STRIP_W = DAY_W * TIMELINE_DAYS;
const LANE_H = 52;
const HEADER_H = 36;
const DAY_MS = 86_400_000;
const ZONE = 'Asia/Kolkata';

const dayDate = (day: number) => new Date(TIMELINE_START.getTime() + day * DAY_MS);
const deadlineOf = (day: number) =>
  new Date(TIMELINE_START.getTime() + (day + 1) * DAY_MS - 60_000);
const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: ZONE });
const dayNumber = new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: ZONE });

/** Greedy lanes so pills spanning two days never overlap. */
const PILLS = (() => {
  const laneEnds: number[] = [];
  return TIMELINE_PILLS.map((pill) => {
    let lane = laneEnds.findIndex((end) => end <= pill.day);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = pill.day + 2;
    return { ...pill, lane };
  });
})();
const LANES = Math.max(...PILLS.map((p) => p.lane)) + 1;

function Pill({ pill, className }: { pill: (typeof PILLS)[number]; className?: string }) {
  const { label } = TYPE_META[pill.type];
  const band = fitBandOf(pill.fit);
  return (
    <div
      className={cn(
        'relative flex h-11 items-center gap-2 overflow-hidden rounded-sm border border-border bg-surface-raised pr-2 pl-3',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[2px]"
        style={{ backgroundColor: `var(${band.colorVar})` }}
      />
      <span className="sr-only">{label}: </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-caption font-medium text-fg">{pill.title}</span>
        <span className="flex items-center gap-1.5">
          <DeadlineCountdown deadlineAt={deadlineOf(pill.day)} now={DEMO_NOW} />
          <span className="font-mono text-mono-sm text-fg-tertiary">Fit {pill.fit}</span>
        </span>
      </span>
    </div>
  );
}

function PillOnStrip({
  pill,
  sweep,
}: {
  pill: (typeof PILLS)[number];
  sweep?: MotionValue<number>;
}) {
  const t = (pill.day * DAY_W + DAY_W / 2) / STRIP_W;
  const fallback = useTransform(() => 1);
  const source = sweep ?? fallback;
  const opacity = useTransform(source, ...fullRange([t - 0.03, t], [0, 1]), { clamp: true });
  const scale = useTransform(source, ...fullRange([t - 0.03, t], [0.85, 1]), { clamp: true });
  return (
    <m.div
      style={
        sweep
          ? { opacity, scale, left: pill.day * DAY_W + 4, top: HEADER_H + 8 + pill.lane * LANE_H }
          : { left: pill.day * DAY_W + 4, top: HEADER_H + 8 + pill.lane * LANE_H }
      }
      className="absolute w-[184px] origin-left"
    >
      <Pill pill={pill} />
    </m.div>
  );
}

function Strip({
  sweep,
  lineX,
  lineLabel,
}: {
  sweep?: MotionValue<number>;
  lineX?: MotionValue<number>;
  lineLabel?: MotionValue<string>;
}) {
  const height = HEADER_H + 40 + LANES * LANE_H;
  return (
    <div className="relative" style={{ width: STRIP_W, height }}>
      {Array.from({ length: TIMELINE_DAYS }, (_, day) => {
        const date = dayDate(day);
        const weekend = day % 7 >= 5;
        const today = day === TIMELINE_TODAY;
        return (
          <div
            key={day}
            className={cn(
              'absolute inset-y-0 border-r border-border-subtle',
              weekend && 'bg-surface-sunken',
            )}
            style={{ left: day * DAY_W, width: DAY_W }}
          >
            <p
              className={cn(
                'flex h-9 items-center px-2 font-mono text-mono-sm uppercase',
                today ? 'text-accent-strong' : 'text-fg-tertiary',
              )}
            >
              {weekday.format(date)} {dayNumber.format(date)}
              {today && <span className="sr-only"> (today)</span>}
            </p>
          </div>
        );
      })}
      {/* Today, fixed in place. */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 w-0.5 bg-accent-strong opacity-30"
        style={{ left: TIMELINE_TODAY * DAY_W }}
      />
      {PILLS.map((pill) => (
        <PillOnStrip key={pill.title} pill={pill} sweep={sweep} />
      ))}
      {lineX && (
        <m.div
          aria-hidden="true"
          style={{ x: lineX }}
          className="absolute inset-y-0 left-0 w-0.5 bg-accent-strong"
        >
          <m.span className="absolute bottom-2 left-1.5 rounded-xs bg-accent-subtle px-1 font-mono text-mono-sm whitespace-nowrap text-accent-subtle-fg">
            {lineLabel}
          </m.span>
        </m.div>
      )}
    </div>
  );
}

function Heading() {
  return (
    <div className="mx-auto w-full max-w-content px-gutter">
      <Kicker>Deadlines</Kicker>
      <h2 id="timeline-title" className="mt-2 font-display text-h1 text-fg">
        {TIMELINE.title}
      </h2>
      <p className="mt-3 max-w-prose text-body-lg text-fg-secondary">{TIMELINE.line}</p>
    </div>
  );
}

function Counter({ className }: { className?: string }) {
  return (
    <p className={cn('text-body text-fg-secondary', className)}>
      <span className="font-mono text-mono-lg text-fg">{TIMELINE.counter.value}</span>{' '}
      {TIMELINE.counter.rest}
    </p>
  );
}

function TimelinePinned() {
  const ref = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const { w: vw } = useElementSize(viewport, { w: 1100, h: 260 });
  const { scrollYProgress: p } = useScroll({ target: ref, offset: landing.timeline.offset });
  const sweep = useTransform(p, ...fullRange(landing.timeline.sweep, [0, 1]), { clamp: true });
  const stripX = useTransform(
    [sweep, vw],
    ([s = 0, v = 0]: number[]) => -Math.max(0, STRIP_W - v) * s,
  );
  const lineX = useTransform(sweep, (s) => s * (STRIP_W - 2));
  const lineLabel = useTransform(sweep, (s) =>
    formatShortDate(dayDate(Math.min(TIMELINE_DAYS - 1, Math.floor(s * TIMELINE_DAYS))), ZONE),
  );
  const end = landing.timeline.sweep[1];
  const counterOpacity = useTransform(p, ...fullRange([end, end + 0.1], [0, 1]), { clamp: true });
  const counterY = useTransform(p, ...fullRange([end, end + 0.1], [8, 0]), { clamp: true });

  return (
    <section ref={ref} aria-labelledby="timeline-title" className="relative h-[180svh]">
      <div className="sticky top-0 flex h-svh flex-col justify-center gap-8 overflow-hidden pt-14">
        <Heading />
        <div className="mx-auto w-full max-w-content px-gutter">
          <div
            ref={viewport}
            className="relative overflow-hidden rounded-xl border border-border bg-surface"
          >
            <m.div style={{ x: stripX }}>
              <Strip sweep={sweep} lineX={lineX} lineLabel={lineLabel} />
            </m.div>
          </div>
          <m.div style={{ opacity: counterOpacity, y: counterY }}>
            <Counter className="mt-5" />
          </m.div>
        </div>
      </div>
    </section>
  );
}

/** Reduced motion (desktop): the strip at rest, every pill visible, scrollable sideways. */
function TimelineStatic() {
  return (
    <section aria-labelledby="timeline-title" className="py-24">
      <Heading />
      <div className="mx-auto mt-8 w-full max-w-content px-gutter">
        <div
          role="region"
          aria-label="Deadline timeline, five weeks"
          tabIndex={0}
          className="overflow-x-auto overscroll-x-contain rounded-xl border border-border bg-surface focus-visible:focus-ring"
        >
          <Strip />
        </div>
        <Counter className="mt-5" />
      </div>
    </section>
  );
}

const agendaReveal = {
  hidden: variants.reveal.hidden,
  visible: (i: number) => ({
    ...variants.reveal.visible,
    transition: { ...springs.smooth, delay: stagger(i, timing.revealStagger) ?? 0 },
  }),
};

/** Phones: a vertical agenda; day groups reveal as they scroll in. */
function TimelineAgenda() {
  const days = [...new Set(PILLS.map((p) => p.day))].filter((d) => d - TIMELINE_TODAY <= 14);
  return (
    <section aria-labelledby="timeline-title" className="py-20">
      <Heading />
      <ol className="mx-auto mt-8 flex w-full max-w-content flex-col gap-5 px-gutter">
        {days.map((day, i) => (
          <m.li
            key={day}
            custom={i}
            variants={agendaReveal}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.5 }}
          >
            <p className="mb-2 font-mono text-mono-sm text-fg-tertiary uppercase">
              {formatShortDate(dayDate(day), ZONE)}
            </p>
            <ul className="flex flex-col gap-2">
              {PILLS.filter((p) => p.day === day).map((pill) => (
                <li key={pill.title}>
                  <Pill pill={pill} className="h-14" />
                </li>
              ))}
            </ul>
          </m.li>
        ))}
      </ol>
      <Counter className="mx-auto mt-6 max-w-content px-gutter" />
    </section>
  );
}

export default function TimelineScene() {
  const reduced = usePrefersReducedMotion();
  const desktop = useMediaQuery('(min-width: 48rem)');
  if (!desktop) return <TimelineAgenda />;
  return reduced ? <TimelineStatic /> : <TimelinePinned />;
}
