/**
 * `/` — the landing page (DESIGN §6.3, MOTION §8): the radar is the hero.
 *
 * Eager (prerendered): nav, hero copy + CTA + the empty feed frame (reserved height), every scene's
 * heading and copy, privacy, finale and footer. Lazy: the live feed (after hydration) and each scene's
 * animated body (when its section is within one viewport). SSR-safe: no browser globals in render.
 */
import { m, useMotionValue, useMotionValueEvent, useScroll, useTransform } from 'motion/react';
import { lazy, Suspense, useEffect, useRef, useState, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react';
import { Link } from 'react-router';

import { BeaconLockup, BeaconMark } from '@/components/brand/BeaconMark';
import { ThemeToggleButton } from '@/components/shell/ThemeToggleButton';
import { GoogleSignInButton } from '@/features/auth/GoogleSignInButton';
import { useBrandAccent } from '@/lib/theme/context';
import { cn } from '@/lib/utils';
import { landing, usePrefersReducedMotion, variants } from '@kestrel/ui';

import { Kicker } from './components/Kicker';
import { EXPLAINER, FINALE, HERO, PRIVACY, STORY, TIMELINE } from './copy';
import { useMounted, useNearViewport } from './lib/hooks';
import { timing } from './lib/timing';

const LiveRadar = lazy(() => import('./components/LiveRadar'));
const StoryScene = lazy(() => import('./scenes/StoryScene'));
const TimelineScene = lazy(() => import('./scenes/TimelineScene'));
const ExplainerScene = lazy(() => import('./scenes/ExplainerScene'));

const PHONE = '(max-width: 47.999rem)';

/** Phone layout flag, read after hydration (false on the server and the first client render). */
function useIsPhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(PHONE);
    const update = () => setPhone(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return phone;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// ── Nav ────────────────────────────────────────────────────────────────────────

function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  return (
    <header className="sticky top-0 z-topbar pt-safe">
      {/* The backdrop fades in as a layer (opacity only); the blur itself never animates. */}
      <div
        aria-hidden="true"
        className={cn(
          'absolute inset-0 border-b border-border-subtle bg-bg/85 backdrop-blur-[8px] transition-opacity duration-fast ease-out',
          scrolled ? 'opacity-100' : 'opacity-0',
        )}
      />
      <nav aria-label="Main" className="relative mx-auto flex h-14 max-w-content items-center gap-2 px-gutter">
        <Link to="/" aria-label="Beacon home" className="-ml-1 rounded-sm px-1 py-0.5 focus-visible:focus-ring">
          <BeaconLockup markClassName="text-accent-strong" />
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggleButton />
          <Link
            to="/login"
            className="press inline-flex h-control-sm items-center rounded-sm px-2.5 text-body font-medium text-fg-secondary hover:bg-surface-hover hover:text-fg focus-visible:focus-ring"
          >
            Sign in
          </Link>
        </div>
      </nav>
    </header>
  );
}

// ── L1 Hero ────────────────────────────────────────────────────────────────────

function Hero() {
  const ref = useRef<HTMLElement>(null);
  const mounted = useMounted();
  const reduced = usePrefersReducedMotion();
  const phone = useIsPhone();
  // Transformers read these flags through a motion value, so a change recomputes without a scroll.
  const flags = useMotionValue(0);
  useEffect(() => flags.set((reduced ? 1 : 0) + (phone ? 2 : 0)), [flags, reduced, phone]);

  const { heroScrollOut } = landing;
  const { scrollYProgress: p } = useScroll({ target: ref, offset: heroScrollOut.offset });
  // Full 0..1 range: on a ScrollTimeline a partial keyframe list falls back to the underlying value.
  const copyOpacity = useTransform(p, [0, ...heroScrollOut.headlineFade.slice(1), 1], [1, 0, 0], { clamp: true });
  const copyY = useTransform([p, flags], ([v = 0, f = 0]: number[]) =>
    f & 1 ? 0 : clamp01(v / heroScrollOut.headlineFade[1]) * timing.headlineY,
  );
  const frameScale = useTransform([p, flags], ([v = 0, f = 0]: number[]) =>
    f & 3 ? 1 : 1 + (heroScrollOut.frameScaleTo - 1) * clamp01(v),
  );
  const frameY = useTransform([p, flags], ([v = 0, f = 0]: number[]) => (f & 1 ? 0 : heroScrollOut.frameY * clamp01(v)));

  return (
    <section
      ref={ref}
      aria-labelledby="hero-title"
      className="relative mx-auto grid max-w-content items-center gap-10 px-gutter pt-6 pb-16 sm:pt-10 lg:min-h-[calc(100svh-3.5rem)] lg:grid-cols-12 lg:gap-12 lg:pt-4"
    >
      <m.div style={{ opacity: copyOpacity, y: copyY }} className="flex flex-col items-start gap-7 lg:col-span-6 xl:col-span-5">
        {/* One clause per line: each line starts at the same point in the fallback serif and in
            Instrument Serif, so the font swap never moves text (CLS 0, the headline is the LCP). */}
        <h1 id="hero-title" className="font-display text-display-xl text-fg">
          <span className="block">{HERO.headline[0]}</span> <span className="block">{HERO.headline[1]}</span>{' '}
          <em className="block text-fg-secondary italic">{HERO.headlineTail}</em>
        </h1>
        <div className="flex w-full flex-col items-start gap-3">
          <GoogleSignInButton className="w-full sm:w-auto" />
          <p className="text-caption text-fg-tertiary">{HERO.caption}</p>
        </div>
      </m.div>

      <m.div
        style={{ scale: frameScale, y: frameY }}
        className="relative h-[330px] w-full rounded-xl border border-border bg-surface shadow-md md:h-[458px] lg:col-span-6 xl:col-span-7"
      >
        {mounted && (
          <Suspense fallback={null}>
            <LiveRadar />
          </Suspense>
        )}
      </m.div>
    </section>
  );
}

// ── Scene slots: copy eager, animated body lazy ────────────────────────────────

function SceneSlot({ Scene, children }: { Scene: LazyExoticComponent<ComponentType>; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const near = useNearViewport(ref);
  return (
    <div ref={ref}>
      {near ? (
        <Suspense fallback={children}>
          <Scene />
        </Suspense>
      ) : (
        children
      )}
    </div>
  );
}

/** Placeholder for L2 before its chunk loads: the same copy, at the pinned scene's height. */
function StoryPlaceholder() {
  return (
    <section aria-labelledby="story-title" className="h-[240svh] md:h-[320svh]">
      <div className="mx-auto max-w-content px-gutter pt-24">
        <Kicker>How it works</Kicker>
        <h2 id="story-title" className="mt-2 font-display text-h1 text-fg">
          {STORY.title}
        </h2>
        <ol className="mt-8 flex max-w-prose flex-col gap-6">
          {STORY.acts.map((act) => (
            <li key={act.key}>
              <h3 className="font-display text-h1 text-fg">{act.title}</h3>
              <p className="mt-2 text-body-lg text-fg-secondary">{act.line}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function TimelinePlaceholder() {
  return (
    <section aria-labelledby="timeline-title" className="min-h-[120svh] md:h-[180svh]">
      <div className="mx-auto max-w-content px-gutter pt-24">
        <Kicker>Deadlines</Kicker>
        <h2 id="timeline-title" className="mt-2 font-display text-h1 text-fg">
          {TIMELINE.title}
        </h2>
        <p className="mt-3 max-w-prose text-body-lg text-fg-secondary">{TIMELINE.line}</p>
      </div>
    </section>
  );
}

function ExplainerPlaceholder() {
  return (
    <section id="explainer" aria-labelledby="explainer-title" className="min-h-[56rem] md:min-h-[44rem]">
      <div className="mx-auto max-w-content px-gutter py-24">
        <Kicker>Fit score</Kicker>
        <h2 id="explainer-title" className="mt-2 font-display text-h1 text-fg">
          {EXPLAINER.title}
        </h2>
        <p className="mt-3 max-w-prose text-body-lg text-fg-secondary">{EXPLAINER.line}</p>
      </div>
    </section>
  );
}

// ── L5 Privacy (static; reveal only) ───────────────────────────────────────────

function Privacy() {
  return (
    <section id="privacy" aria-labelledby="privacy-title" className="mx-auto max-w-content px-gutter py-24 md:py-32">
      <m.div
        variants={variants.reveal}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
        className="max-w-prose"
      >
        <Kicker>Privacy</Kicker>
        <h2 id="privacy-title" className="mt-2 font-display text-h1 text-fg">
          {PRIVACY.title}
        </h2>
        <p className="mt-4 text-body-lg text-fg-secondary">{PRIVACY.body}</p>
      </m.div>
      <m.dl
        variants={variants.reveal}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
        className="mt-12 max-w-3xl divide-y divide-border-subtle border-y border-border-subtle"
      >
        {PRIVACY.facts.map((fact) => (
          <div key={fact.title} className="grid gap-1 py-4 sm:grid-cols-[12rem_1fr] sm:gap-6">
            <dt className="text-body font-medium text-fg">{fact.title}</dt>
            <dd className="text-body text-fg-secondary">{fact.body}</dd>
          </div>
        ))}
      </m.dl>
      <p className="mt-8 max-w-prose text-body text-fg-secondary">{PRIVACY.dont}</p>
    </section>
  );
}

// ── L6 Finale: the light lands on the button (forced dark) ─────────────────────

function Finale() {
  const ref = useRef<HTMLElement>(null);
  const reduced = usePrefersReducedMotion();
  const phone = useIsPhone();
  const flags = useMotionValue(0);
  useEffect(() => flags.set((reduced ? 1 : 0) + (phone ? 2 : 0)), [flags, reduced, phone]);

  const { finale } = landing;
  const { scrollYProgress: p } = useScroll({ target: ref, offset: finale.offset });
  const rotate = useTransform([p, flags], ([v = 0, f = 0]: number[]) => {
    const to = f & 2 ? timing.mobileBeamTo : finale.beamTo;
    return f & 1 ? to : finale.beamFrom + (to - finale.beamFrom) * clamp01(v);
  });
  const scaleX = useTransform([p, flags], ([v = 0, f = 0]: number[]) => (f & 1 ? 1 : clamp01(v)));
  const [scrolledLit, setScrolledLit] = useState(false);
  useMotionValueEvent(p, 'change', (v) => setScrolledLit(v >= finale.lightsAt));
  const lit = reduced || scrolledLit;

  return (
    <section ref={ref} aria-labelledby="finale-title" className="dark relative overflow-hidden bg-bg text-fg">
      <div className="mx-auto grid min-h-svh max-w-content items-center gap-12 px-gutter py-24 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-16">
        <div className="relative mx-auto size-36 md:mx-0 md:size-56 md:justify-self-center lg:size-64">
          {/* A flat 7 % cone from the source (same construction as the OG card). Only the light moves; the mark never rotates. */}
          <m.div
            aria-hidden="true"
            style={{ rotate, scaleX }}
            className="pointer-events-none absolute top-[53.6%] left-[46.4%] h-[44rem] w-[60rem] origin-left -translate-y-1/2 bg-accent text-accent-fg opacity-[0.07] [clip-path:polygon(0_50%,100%_0,100%_100%)]"
          />
          <BeaconMark className="relative size-full text-accent-strong" />
        </div>
        <div className="relative flex flex-col items-center gap-6 text-center md:items-start md:text-left">
          <h2 id="finale-title" className="text-balance font-display text-display text-fg">
            {FINALE.title}
          </h2>
          <p className="max-w-prose text-body-lg text-fg-secondary">{FINALE.line}</p>
          <span
            data-lit={lit || undefined}
            className={cn(
              'relative inline-flex rounded-sm',
              'after:pointer-events-none after:absolute after:inset-0 after:rounded-sm after:opacity-0 after:shadow-[0_0_24px_16px_color-mix(in_oklab,var(--color-accent)_12%,transparent)]',
              'after:transition-opacity after:duration-slow after:ease-out data-lit:after:opacity-100',
              'data-lit:[&_[data-slot=button]]:border-accent-strong',
            )}
          >
            <GoogleSignInButton />
          </span>
        </div>
      </div>
    </section>
  );
}

// ── L7 Footer ──────────────────────────────────────────────────────────────────

function Footer() {
  const link = 'rounded-xs text-fg-secondary underline-offset-3 hover:text-fg hover:underline focus-visible:focus-ring';
  return (
    <footer className="border-t border-border-subtle bg-bg">
      <div className="mx-auto flex max-w-content flex-col gap-5 px-gutter py-10 pb-[calc(2.5rem+var(--safe-bottom))] sm:flex-row sm:items-center">
        <div className="flex flex-col gap-1">
          <BeaconLockup />
          <p className="text-caption text-fg-tertiary">Free and open source, MIT licensed. Built for students in India and anywhere else.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 text-small sm:ml-auto">
          <a className={link} href="/privacy">
            Privacy
          </a>
          <a className={link} href="/terms">
            Terms
          </a>
          <a className={link} href="https://github.com/AkashaPrasad/beacon" rel="noopener noreferrer">
            Source on GitHub
          </a>
          <Link className={link} to="/login">
            Sign in
          </Link>
        </nav>
      </div>
    </footer>
  );
}

export function LandingScreen() {
  useBrandAccent();
  return (
    <div data-testid="landing-page" className="min-h-dvh bg-bg text-fg">
      <LandingNav />
      <main id="main" tabIndex={-1} className="outline-none">
        <Hero />
        <SceneSlot Scene={StoryScene}>
          <StoryPlaceholder />
        </SceneSlot>
        <SceneSlot Scene={TimelineScene}>
          <TimelinePlaceholder />
        </SceneSlot>
        <SceneSlot Scene={ExplainerScene}>
          <ExplainerPlaceholder />
        </SceneSlot>
        <Privacy />
        <Finale />
      </main>
      <Footer />
    </div>
  );
}
