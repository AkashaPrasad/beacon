/**
 * L4 fit-score explainer (MOTION §8 L4): six live weights. Drag one and the others renormalise; the
 * ring, the contribution bars and three sample rows follow in the same frame. While nobody touches it,
 * the weights cycle through three presets; any pointer or key input stops that for the session.
 * Reduced motion: no demo, values update instantly (still fully interactive).
 */
import { animate, AnimatePresence, m, useInView, useMotionValue, useTransform } from 'motion/react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import { Button } from '@/components/ui/button';
import {
  CompanyLogo,
  fitBandOf,
  FitRing,
  landing,
  springs,
  stagger,
  usePrefersReducedMotion,
  variants,
  type SpringTransition,
} from '@kestrel/ui';

import { Kicker } from '../components/Kicker';
import { EXPLAINER } from '../copy';
import { COMPONENTS, DEFAULT_WEIGHTS, EXPLAINER_ROWS, FEED, PRESETS } from '../data';
import { usePageVisible } from '../lib/hooks';
import { clamp01, useElementSize } from '../lib/math';
import { timing } from '../lib/timing';

const ROW = 64;
type Source = 'preset' | 'user';

const scoreFor = (values: readonly number[], weights: readonly number[]) =>
  100 * weights.reduce((sum, w, k) => sum + w * (values[k] ?? 0), 0);

/** Set weight `k` to `value` and scale the others so the total stays 1. */
function renormalise(weights: readonly number[], k: number, value: number): number[] {
  const v = clamp01(value);
  const rest = 1 - (weights[k] ?? 0);
  return weights.map((w, j) => (j === k ? v : rest > 1e-6 ? (w * (1 - v)) / rest : (1 - v) / (weights.length - 1)));
}

interface SliderProps {
  label: string;
  value: number;
  transition: SpringTransition;
  reduced: boolean;
  onChange: (value: number) => void;
}

/** A transform-only slider: the thumb tracks the pointer 1:1; programmatic changes glide on a spring. */
function WeightSlider({ label, value, transition, reduced, onChange }: SliderProps) {
  const labelId = useId();
  const track = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);
  const [active, setActive] = useState(false);
  const mv = useMotionValue(value);
  const { w: trackWidth } = useElementSize(track, { w: 320, h: 24 });
  // Pixels, not a % of a full-width wrapper: a wide transformed box would widen the page on phones.
  const x = useTransform([mv, trackWidth], ([v = 0, tw = 0]: number[]) => clamp01(v) * tw);
  const pct = Math.round(value * 100);

  useEffect(() => {
    if (dragging.current || reduced) {
      mv.set(value);
      return undefined;
    }
    if (Math.abs(mv.get() - value) < 1e-4) return undefined;
    const controls = animate(mv, value, transition);
    return () => controls.stop();
  }, [mv, value, transition, reduced]);

  const fromPointer = (clientX: number) => {
    const rect = track.current?.getBoundingClientRect();
    return rect && rect.width ? clamp01((clientX - rect.left) / rect.width) : value;
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    setActive(true);
    thumb.current?.focus({ preventScroll: true });
    onChange(fromPointer(e.clientX));
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) onChange(fromPointer(e.clientX));
  };
  const end = () => {
    dragging.current = false;
    setActive(false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    const step = e.shiftKey ? 0.1 : 0.01;
    const next: Record<string, number> = {
      ArrowRight: value + step,
      ArrowUp: value + step,
      ArrowLeft: value - step,
      ArrowDown: value - step,
      PageUp: value + 0.1,
      PageDown: value - 0.1,
      Home: 0,
      End: 1,
    };
    if (!(e.key in next)) return;
    e.preventDefault();
    onChange(clamp01(next[e.key] ?? value));
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-small">
        <span id={labelId} className="text-fg">
          {label}
        </span>
        <span className="font-mono text-mono-sm text-fg-secondary tabular-nums">{pct}%</span>
      </div>
      <div
        ref={track}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        className="relative h-6 touch-none select-none"
      >
        <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-sunken" />
        <m.span
          aria-hidden="true"
          className="absolute inset-x-0 top-1/2 h-1 origin-left -translate-y-1/2 rounded-full bg-fg-secondary"
          style={{ scaleX: mv }}
        />
        <m.span className="pointer-events-none absolute inset-y-0 left-0 w-0" style={{ x }}>
          <AnimatePresence>
            {active && (
              <m.span
                key="bubble"
                aria-hidden="true"
                variants={variants.popover}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="absolute bottom-full left-0 mb-1 -translate-x-1/2 rounded-sm bg-tooltip px-1.5 py-0.5 font-mono text-mono-sm text-tooltip-fg"
              >
                {pct}%
              </m.span>
            )}
          </AnimatePresence>
          <m.span
            ref={thumb}
            role="slider"
            tabIndex={0}
            aria-labelledby={labelId}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-valuetext={`${pct} percent`}
            onKeyDown={onKeyDown}
            animate={{ scale: active ? 1.15 : 1 }}
            transition={springs.snappy}
            className="pointer-events-auto absolute top-1/2 left-0 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border-strong bg-surface-raised shadow-sm focus-visible:focus-ring"
          />
        </m.span>
      </div>
    </div>
  );
}

export default function ExplainerScene() {
  const reduced = usePrefersReducedMotion();
  const pageVisible = usePageVisible();
  const root = useRef<HTMLElement>(null);
  const inView = useInView(root, { amount: 0.4 });
  const entered = useInView(root, { once: true, amount: 0.4 });
  const [weights, setWeights] = useState<number[]>([...DEFAULT_WEIGHTS]);
  const [source, setSource] = useState<Source>('preset');
  const [preset, setPreset] = useState(0);
  const [handsOn, setHandsOn] = useState(false);
  const [pointerInside, setPointerInside] = useState(false);
  const [settled, setSettled] = useState(false);
  const demoStarted = useRef(false);

  const demo = !reduced && !handsOn && inView && !pointerInside && pageVisible;
  useEffect(() => {
    if (!demo) return undefined;
    const { idleBeforeDemo, presetInterval } = landing.explainer;
    const t = setTimeout(
      () => {
        demoStarted.current = true;
        const next = (preset + 1) % PRESETS.length;
        setPreset(next);
        setSource('preset');
        setWeights([...(PRESETS[next]?.weights ?? DEFAULT_WEIGHTS)]);
      },
      (demoStarted.current ? presetInterval : idleBeforeDemo) * 1000,
    );
    return () => clearTimeout(t);
  }, [demo, preset]);

  // Bars stagger only on the first entrance; afterwards they follow the weights directly.
  useEffect(() => {
    if (!entered || settled) return undefined;
    const t = setTimeout(() => setSettled(true), 600);
    return () => clearTimeout(t);
  }, [entered, settled]);

  const featured = EXPLAINER_ROWS[0];
  const featuredScore = scoreFor(featured.values, weights);
  const band = fitBandOf(featuredScore);
  const contributions = featured.values.map((v, k) => 100 * (weights[k] ?? 0) * v);
  const largest = contributions.indexOf(Math.max(...contributions));
  const ranked = [...EXPLAINER_ROWS]
    .map((row) => ({ ...row, score: scoreFor(row.values, weights) }))
    .sort((a, b) => b.score - a.score);
  const sliderTransition = source === 'preset' ? springs.smooth : springs.snappy;
  const presetName = handsOn ? 'Your weights' : `Preset: ${PRESETS[preset]?.name ?? 'Balanced'}`;

  const stopDemo = () => setHandsOn(true);
  const setWeight = (k: number, value: number) => {
    setHandsOn(true);
    setSource('user');
    setWeights((current) => renormalise(current, k, value));
  };

  return (
    <section
      ref={root}
      id="explainer"
      aria-labelledby="explainer-title"
      className="mx-auto max-w-content px-gutter py-24 md:py-32"
      onPointerDown={stopDemo}
      onKeyDown={stopDemo}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setPointerInside(true)}
      onPointerLeave={() => setPointerInside(false)}
    >
      <Kicker>Fit score</Kicker>
      <h2 id="explainer-title" className="mt-2 font-display text-h1 text-fg">
        {EXPLAINER.title}
      </h2>
      <p className="mt-3 max-w-prose text-body-lg text-fg-secondary">{EXPLAINER.line}</p>

      <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-6">
            <FitRing score={featuredScore} size={160} animateId="landing-explainer" className="hidden sm:inline-flex" />
            <FitRing score={featuredScore} size={64} animateId="landing-explainer-sm" className="sm:hidden" />
            <div className="min-w-0">
              <p className="truncate text-body font-medium text-fg">{featured.title}</p>
              <p className="truncate text-small text-fg-secondary">{featured.company}</p>
              <p className="mt-2 font-mono text-mono text-fg">
                {Math.round(featuredScore)} · <span style={{ color: `var(${band.colorVar})` }}>{band.label}</span>
              </p>
              <p aria-live="off" className="mt-1 text-caption text-fg-tertiary">
                {presetName}
              </p>
            </div>
          </div>
          <ul aria-label="Contribution to the score" className="flex flex-col gap-2">
            {COMPONENTS.map((name, k) => (
              <li key={name} className="flex items-center gap-3 text-small">
                <span className="w-24 shrink-0 text-fg-secondary">{name}</span>
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                  <m.span
                    className="block h-full origin-left rounded-full"
                    style={{ backgroundColor: k === largest ? `var(${band.colorVar})` : 'var(--color-fg-secondary)' }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: entered ? Math.min(1, (contributions[k] ?? 0) / 50) : 0 }}
                    transition={{ ...springs.data, delay: settled ? 0 : (stagger(k, timing.revealStagger) ?? 0) }}
                  />
                </span>
                <span className="w-12 shrink-0 text-right font-mono text-mono-sm text-fg tabular-nums">
                  +{(contributions[k] ?? 0).toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-4">
            <legend className="mb-1 text-h3 text-fg">Weights</legend>
            {COMPONENTS.map((name, k) => (
              <WeightSlider
                key={name}
                label={name}
                value={weights[k] ?? 0}
                transition={sliderTransition}
                reduced={reduced}
                onChange={(v) => setWeight(k, v)}
              />
            ))}
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setSource('preset');
                setWeights([...DEFAULT_WEIGHTS]);
              }}
            >
              Reset to balanced
            </Button>
            <p className="text-caption text-fg-tertiary">{EXPLAINER.note}</p>
          </div>
        </div>
      </div>

      <div className="mt-14">
        <h3 className="text-h3 text-fg">How three listings rank with these weights</h3>
        <ol className="relative mt-3 overflow-hidden rounded-xl border border-border bg-surface" style={{ height: ranked.length * ROW }}>
          {ranked.map((row, rank) => (
            <m.li
              key={row.id}
              initial={false}
              animate={{ y: rank * ROW }}
              transition={springs.gentle}
              className="absolute inset-x-0 top-0 flex h-16 items-center gap-3 border-b border-border-subtle bg-surface px-4 last:border-0"
            >
              <CompanyLogo name={row.company} domain={FEED.find((l) => l.id === row.id)?.domain} size={28} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-body">
                  <span className="font-medium text-fg">{row.title}</span>
                  <span className="text-fg-secondary"> · {row.company}</span>
                </span>
                <span className="truncate text-small text-fg-tertiary">{row.meta}</span>
              </span>
              <FitRing score={row.score} size={28} label="below" className="[&>span+span]:hidden sm:[&>span+span]:inline" />
            </m.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
