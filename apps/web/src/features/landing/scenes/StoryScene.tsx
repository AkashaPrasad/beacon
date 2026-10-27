/**
 * L2 "Sources → Fit → Alerts" (MOTION §8 L2): one pinned scene scrubbed by scroll. Act 1: noise
 * converges into a funnel; act 2: rows rank themselves with the working shown; act 3: one signal lifts
 * and a push arrives. Every value is a Motion value (no React render per frame). Reduced motion: three
 * static final frames, no pinning.
 */
import { m, useMotionValueEvent, useScroll, useTransform, type MotionValue } from 'motion/react';
import { useRef, useState } from 'react';

import { useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';
import { CompanyLogo, FitRing, landing, usePrefersReducedMotion } from '@kestrel/ui';

import { Kicker } from '../components/Kicker';
import { STORY } from '../copy';
import { FEED, SOURCE_CHIPS, STATS, STORY_ROWS } from '../data';
import { NotificationCard, ScrubRing } from './shared';
import { clamp01, easeInOut, fullRange, mix, rand, useElementSize } from '../lib/math';
import { timing } from '../lib/timing';

const ROW = 56;
const fmt = new Intl.NumberFormat('en-IN');
const domainOf = (id: string) => FEED.find((l) => l.id === id)?.domain ?? null;
const partsOf = (id: string) => FEED.find((l) => l.id === id)?.parts ?? [];

type Acts = { a1: MotionValue<number>; a2: MotionValue<number>; a3: MotionValue<number> };

function Chip({ k, n, label, acts, w, h }: { k: number; n: number; label: string; acts: Acts; w: MotionValue<number>; h: MotionValue<number> }) {
  const { a1, a2 } = acts;
  const sx = rand(k, 1) - 0.5;
  const sy = rand(k, 2) - 0.5;
  const tilt = (rand(k, 3) - 0.5) * 6;
  // Funnel slot: a centred deck, each chip 8 px under the last and slightly smaller, so the noise
  // ends as one orderly column (the next act collapses it into rows).
  const slot = k / Math.max(1, n - 1);
  const t = useTransform(a1, (v) => easeInOut(clamp01((v - k * 0.012) / 0.6)));
  const x = useTransform([t, w], ([tv = 0, wv = 0]: number[]) => mix(sx * 0.9 * wv, 0, tv));
  const y = useTransform([t, h], ([tv = 0, hv = 0]: number[]) => mix(sy * 0.85 * hv, (slot - 0.5) * Math.min(hv * 0.6, n * 8), tv));
  const rotate = useTransform(t, (tv) => tilt * (1 - tv));
  // In the deck, chips further back are smaller and dimmer, so it reads as depth rather than overlap.
  const opacity = useTransform([t, a2], ([tv = 0, v2 = 0]: number[]) => mix(0.35, 0.2 + 0.8 * slot ** 1.5, tv) * (1 - clamp01(v2 / 0.25)));
  const scale = useTransform([t, a2], ([tv = 0, v2 = 0]: number[]) => mix(1, 0.8 + 0.2 * slot, tv) * (1 - 0.1 * clamp01(v2 / 0.25)));
  const [kind = '', slug = ''] = label.split(' · ');
  return (
    <m.span
      aria-hidden="true"
      style={{ x, y, rotate, opacity, scale }}
      className="absolute top-1/2 left-1/2 inline-flex h-7 -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-xs border border-border bg-surface-raised pr-2 pl-1 font-mono text-mono-sm whitespace-nowrap text-fg-secondary"
    >
      <CompanyLogo name={slug} size={20} className="border-0" />
      <span className="text-fg-tertiary">{kind}</span>
      {slug}
    </m.span>
  );
}

function StoryRow({ row, rank, from, acts, top }: { row: (typeof STORY_ROWS)[number]; rank: number; from: number; acts: Acts; top: boolean }) {
  const { a2, a3 } = acts;
  const sort = useTransform(a2, (v) => easeInOut(clamp01((v - 0.35) / 0.5)));
  const lift = useTransform(a3, (v) => clamp01(v / 0.4));
  const y = useTransform([sort, lift], ([s = 0, l = 0]: number[]) => mix(from * ROW, rank * ROW, s) - (top ? 4 * l : 0));
  const scale = useTransform(lift, (l) => (top ? 1 + 0.03 * l : 1));
  const opacity = useTransform([a2, lift], ([v2 = 0, l = 0]: number[]) => {
    const fadeIn = clamp01((v2 - 0.1) / 0.25);
    const dimLow = row.score < 60 ? mix(1, 0.35, clamp01((v2 - 0.5) / 0.3)) : 1;
    return fadeIn * dimLow * (top ? 1 : mix(1, 0.2, l));
  });
  const fill = useTransform(a2, (v) => clamp01(v / 0.6));
  const parts = partsOf(row.id);
  return (
    <m.li
      style={{ y, scale, opacity }}
      className={cn(
        'absolute inset-x-0 top-0 flex h-14 items-center gap-3 border-b border-border-subtle bg-surface px-3',
        top && 'z-raised rounded-md',
      )}
    >
      <CompanyLogo name={row.company} domain={domainOf(row.id)} size={28} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-body">
          <span className="font-medium text-fg">{row.title}</span>
          <span className="text-fg-secondary"> · {row.company}</span>
        </span>
        {top ? (
          <span aria-hidden="true" className="block h-1 w-40 max-w-full overflow-hidden rounded-full bg-surface-sunken">
            <m.span className="flex h-full origin-left" style={{ scaleX: a2 }}>
              {parts.map((part, i) => (
                <span
                  key={i}
                  className={cn('h-full', i === 0 ? 'bg-fit-great' : i % 2 ? 'bg-fg-tertiary' : 'bg-fg-secondary')}
                  style={{ width: `${part}%` }}
                />
              ))}
            </m.span>
          </span>
        ) : (
          <span className="text-small text-fg-tertiary">{row.score < 60 ? 'Below your threshold' : 'Above your threshold'}</span>
        )}
      </span>
      <ScrubRing score={row.score} fill={fill} />
    </m.li>
  );
}

function StoryPinned() {
  const ref = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const phone = useMediaQuery('(max-width: 47.999rem)');
  const { scrollYProgress: p } = useScroll({ target: ref, offset: landing.story.offset });
  const { acts: ranges, pingAt } = landing.story;
  const a1 = useTransform(p, ...fullRange(ranges.sources, [0, 1]), { clamp: true });
  const a2 = useTransform(p, ...fullRange(ranges.fit, [0, 1]), { clamp: true });
  const a3 = useTransform(p, ...fullRange(ranges.alerts, [0, 1]), { clamp: true });
  const acts = { a1, a2, a3 };
  const { w, h } = useElementSize(stage);

  const [ping, setPing] = useState(0);
  const armed = useRef(true);
  useMotionValueEvent(p, 'change', (v) => {
    if (v >= pingAt && armed.current) {
      armed.current = false;
      setPing((n) => n + 1);
    } else if (v < timing.storyRearm) {
      armed.current = true;
    }
  });

  // Copy: each act's line is a bell over its own slice of the progress. The outgoing line is gone
  // before the next one starts, so two sentences never sit on top of each other.
  const out = (b: number) => [b - 0.06, b - 0.01];
  const into = (b: number) => [b + 0.01, b + 0.06];
  const b1 = ranges.sources[1];
  const b2 = ranges.fit[1];
  const copy0 = useTransform(p, ...fullRange([0, ...out(b1)], [1, 1, 0]));
  const copy1 = useTransform(p, ...fullRange([...into(b1), ...out(b2)], [0, 1, 1, 0]));
  const copy2 = useTransform(p, ...fullRange(into(b2), [0, 1]));
  const copyOpacity = [copy0, copy1, copy2];

  const counter = useTransform(a1, (v) => fmt.format(Math.round(v * STATS.sources)));
  const counterOpacity = useTransform(a2, (v) => 1 - clamp01(v / 0.25));
  const notify = useTransform(a3, (v) => clamp01(v / 0.4));
  const notifyX = useTransform(notify, (v) => (1 - v) * 24);
  const notifyY = useTransform(notify, (v) => (1 - v) * -24);

  const chips = SOURCE_CHIPS.slice(0, phone ? 16 : SOURCE_CHIPS.length);
  // Phones show the top four; arrival order is re-indexed within them.
  const rows = phone ? STORY_ROWS.slice(0, 4) : STORY_ROWS;
  const arrival = [...rows].sort((a, b) => a.feedOrder - b.feedOrder).map((r) => r.id);

  return (
    <section ref={ref} aria-labelledby="story-title" className="relative h-[240svh] md:h-[320svh]">
      <div className="sticky top-0 flex h-svh flex-col overflow-hidden pt-16 pb-6">
        <div className="mx-auto grid w-full max-w-content flex-1 grid-rows-[auto_1fr] items-center gap-6 px-gutter md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:grid-rows-1 md:gap-12">
          <div>
            <Kicker>How it works</Kicker>
            <h2 id="story-title" className="mt-2 font-display text-h1 text-fg">
              {STORY.title}
            </h2>
            <ol className="relative mt-6 grid">
              {STORY.acts.map((act, k) => (
                <m.li key={act.key} style={{ opacity: copyOpacity[k] }} className="col-start-1 row-start-1">
                  <h3 className="font-display text-[1.75rem] leading-tight text-fg md:text-h1">{act.title}</h3>
                  <p className="mt-2 max-w-prose text-body-lg text-fg-secondary">{act.line}</p>
                </m.li>
              ))}
            </ol>
          </div>

          <div ref={stage} aria-hidden="true" className="relative h-full max-h-[32rem] min-h-72 w-full">
            <m.p style={{ opacity: counterOpacity }} className="absolute top-0 left-0 font-mono text-mono-lg text-fg">
              <m.span>{counter}</m.span> <span className="text-small font-normal text-fg-tertiary">sources</span>
            </m.p>
            {chips.map((label, k) => (
              <Chip key={label} k={k} n={chips.length} label={label} acts={acts} w={w} h={h} />
            ))}
            <ul
              className="absolute inset-x-0 top-1/2 mx-auto -translate-y-1/2 md:mr-auto md:ml-0 md:max-w-md"
              style={{ height: rows.length * ROW }}
            >
              {rows.map((row, rank) => (
                <StoryRow key={row.id} row={row} rank={rank} from={arrival.indexOf(row.id)} acts={acts} top={rank === 0} />
              ))}
            </ul>
            <m.div
              style={{ opacity: notify, x: phone ? 0 : notifyX, y: phone ? notifyY : 0 }}
              className="absolute inset-x-0 top-0 mx-auto w-72 md:inset-x-auto md:top-auto md:right-0 md:bottom-2"
            >
              <NotificationCard ping={ping} />
            </m.div>
          </div>
        </div>

        <ol aria-hidden="true" className="mx-auto grid w-full max-w-content grid-cols-3 gap-3 px-gutter">
          {STORY.acts.map((act, k) => (
            <li key={act.key} className="flex flex-col gap-1.5">
              <span className="text-caption text-fg-tertiary">{act.label}</span>
              <span className="h-0.5 overflow-hidden rounded-full bg-border">
                <m.span className="block h-full origin-left rounded-full bg-accent-strong" style={{ scaleX: [a1, a2, a3][k] }} />
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Reduced motion: the final frame of each act, stacked, with its copy. */
function StoryStatic() {
  return (
    <section aria-labelledby="story-title" className="mx-auto max-w-content px-gutter py-24">
      <Kicker>How it works</Kicker>
      <h2 id="story-title" className="mt-2 font-display text-h1 text-fg">
        {STORY.title}
      </h2>
      <ol className="mt-10 grid gap-6 lg:grid-cols-3">
        {STORY.acts.map((act, k) => (
          <li key={act.key} className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5">
            <div>
              <h3 className="text-h2 text-fg">{act.title}</h3>
              <p className="mt-1.5 text-body text-fg-secondary">{act.line}</p>
            </div>
            {k === 0 && (
              <div className="flex flex-wrap gap-1.5" aria-hidden="true">
                {SOURCE_CHIPS.slice(0, 10).map((label) => (
                  <span key={label} className="inline-flex h-6 items-center rounded-xs border border-border bg-surface-raised px-2 font-mono text-mono-sm text-fg-secondary">
                    {label}
                  </span>
                ))}
                <span className="inline-flex h-6 items-center px-1 font-mono text-mono-sm text-fg-tertiary">
                  +{STATS.sources - 10} more
                </span>
              </div>
            )}
            {k === 1 && (
              <ul className="flex flex-col">
                {STORY_ROWS.map((row) => (
                  <li key={row.id} className={cn('flex h-12 items-center gap-3 border-b border-border-subtle last:border-0', row.score < 60 && 'opacity-40')}>
                    <span className="min-w-0 flex-1 truncate text-small text-fg">{row.title}</span>
                    <FitRing score={row.score} size={28} />
                  </li>
                ))}
              </ul>
            )}
            {k === 2 && <NotificationCard />}
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function StoryScene() {
  const reduced = usePrefersReducedMotion();
  return reduced ? <StoryStatic /> : <StoryPinned />;
}
