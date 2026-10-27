/**
 * `/` — the landing page. The radar is the hero: a night band with the lamp and its sweeping beam, the
 * live demo feed under the light, then the scroll story. Eager (prerendered): nav, hero copy + CTAs +
 * the empty feed frame (reserved height), every scene's heading and copy, honesty, FAQ, finale and
 * footer. Lazy: the live feed (after hydration) and each scene's animated body (within one viewport).
 * SSR-safe: no browser globals in render.
 */
import { ArrowDown, ArrowRight } from 'lucide-react';
import { m, useMotionValue, useMotionValueEvent, useScroll, useTransform } from 'motion/react';
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from 'react';
import { Link } from 'react-router';

import { BeaconMark } from '@/components/brand/BeaconMark';
import { Button } from '@/components/ui/button';
import { Band, Container, Eyebrow } from '@/features/marketing/components/Atmosphere';
import { CountUp } from '@/features/marketing/components/CountUp';
import { Faq } from '@/features/marketing/components/Faq';
import { LogoMarquee } from '@/features/marketing/components/LogoMarquee';
import { MarketingFooter, MarketingNav } from '@/features/marketing/components/MarketingLayout';
import { Seo } from '@/features/marketing/components/Seo';
import { Tilt } from '@/features/marketing/components/Tilt';
import { PUBLIC_PAGES } from '@/features/marketing/content/pages';
import { useBrandAccent } from '@/lib/theme/context';
import { cn } from '@/lib/utils';
import { landing, springs, usePrefersReducedMotion, variants } from '@kestrel/ui';

import '@/features/marketing/marketing.css';

import { Kicker } from './components/Kicker';
import { EXPLAINER, FAQ, FINALE, HERO, PRIVACY, PROOF, SIGNALS, STORY, TIMELINE } from './copy';
import { beamAngle, beamOnPanel } from './lib/beam';
import { useMounted, useNearViewport } from './lib/hooks';
import { timing } from './lib/timing';

const LiveRadar = lazy(() => import('./components/LiveRadar'));
const Beacon3D = lazy(() => import('./components/Beacon3D'));
const StoryScene = lazy(() => import('./scenes/StoryScene'));
const TimelineScene = lazy(() => import('./scenes/TimelineScene'));
const SignalsScene = lazy(() => import('./scenes/SignalsScene'));
const ExplainerScene = lazy(() => import('./scenes/ExplainerScene'));

const PHONE = '(max-width: 47.999rem)';
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

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

// ── Hero ───────────────────────────────────────────────────────────────────────

function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const mounted = useMounted();
  const reduced = usePrefersReducedMotion();
  const phone = useIsPhone();
  const flags = useMotionValue(0);
  useEffect(() => flags.set((reduced ? 1 : 0) + (phone ? 2 : 0)), [flags, reduced, phone]);

  const { heroScrollOut } = landing;
  const { scrollYProgress: p } = useScroll({ target: ref, offset: heroScrollOut.offset });
  const copyOpacity = useTransform(p, [0, ...heroScrollOut.headlineFade.slice(1), 1], [1, 0, 0], {
    clamp: true,
  });
  const copyY = useTransform([p, flags], ([v = 0, f = 0]: number[]) =>
    f & 1 ? 0 : clamp01(v / heroScrollOut.headlineFade[1]) * timing.headlineY,
  );
  const frameScale = useTransform([p, flags], ([v = 0, f = 0]: number[]) =>
    f & 3 ? 1 : 1 + (heroScrollOut.frameScaleTo - 1) * clamp01(v),
  );
  const frameY = useTransform([p, flags], ([v = 0, f = 0]: number[]) =>
    f & 1 ? 0 : heroScrollOut.frameY * clamp01(v),
  );
  // The panel highlight follows the 3D beam: it crosses the panel as the light sweeps past, and brightens
  // when the beam faces it.
  const sweepX = useTransform(beamAngle, (a) => `${Math.cos(a) * 36}%`);
  const sweepOpacity = useTransform(beamAngle, (a) => 0.35 + beamOnPanel(a) * 0.65);

  return (
    <Band tone="night" grid={false} aria-labelledby="hero-title" className="min-h-svh">
      {mounted && (
        <Suspense fallback={null}>
          <Beacon3D className="mk-beacon3d" />
        </Suspense>
      )}
      <div
        ref={ref}
        className="relative z-10 mx-auto grid max-w-content items-center gap-10 px-gutter pt-12 pb-20 sm:pt-16 lg:min-h-[calc(100svh-3.5rem)] lg:grid-cols-12 lg:gap-10 lg:pt-12"
      >
        <m.div
          style={{ opacity: copyOpacity, y: copyY }}
          className="flex flex-col items-start gap-7 lg:col-span-6 xl:col-span-5"
        >
          <Eyebrow>{HERO.eyebrow}</Eyebrow>
          <h1 id="hero-title" className="mk-display-hero text-balance text-fg">
            <span className="block">{HERO.headline}</span>
            <span className="block text-fg-secondary">
              <em className="text-fg-secondary">{HERO.headlineTail.em}</em>
              {HERO.headlineTail.after}
            </span>
          </h1>
          <p className="mk-lede max-w-xl text-fg-secondary">{HERO.sentence}</p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Button asChild variant="primary" size="lg" className="mk-btn-light group gap-2">
              <Link to="/login" data-testid="hero-cta">
                {HERO.cta}
                <ArrowRight
                  className="size-4 transition-transform duration-fast group-hover:translate-x-0.5"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="lg" className="mk-btn-ghost-dark gap-2">
              <a href="#how">
                {HERO.secondary}
                <ArrowDown className="size-4" strokeWidth={1.75} aria-hidden="true" />
              </a>
            </Button>
          </div>
          <p className="font-mono text-mono-sm text-fg-tertiary">
            {PROOF.stats[0].value} sources · {PROOF.stats[1].value} packs · free ·{' '}
            {HERO.caption.replace('Free, forever. ', '')}
          </p>
        </m.div>

        <m.div
          style={{ scale: frameScale, y: frameY }}
          className="relative lg:col-span-6 lg:mt-36 xl:col-span-7"
        >
          <Tilt className="mk-panel mk-rim relative h-[340px] w-full overflow-hidden md:h-[468px]">
            <m.div
              aria-hidden="true"
              className="mk-sweep"
              style={{ x: sweepX, opacity: sweepOpacity }}
            />
            {mounted && (
              <Suspense fallback={null}>
                <LiveRadar />
              </Suspense>
            )}
          </Tilt>
        </m.div>
      </div>
    </Band>
  );
}

// ── Proof strip ────────────────────────────────────────────────────────────────

function Proof() {
  return (
    <Band
      tone="wash"
      wash="a"
      grid={false}
      aria-labelledby="proof-title"
      className="border-y border-border-subtle"
    >
      <Container className="py-14 md:py-18">
        <h2 id="proof-title" className="sr-only">
          What Beacon watches
        </h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
          {PROOF.stats.map((s) => (
            <div key={s.label} className="flex flex-col gap-1.5">
              <dd className="mk-stat order-1">
                <CountUp
                  value={s.value}
                  prefix={'prefix' in s ? s.prefix : ''}
                  suffix={'suffix' in s ? s.suffix : ''}
                />
              </dd>
              <dt className="order-2 text-small text-fg-secondary">{s.label}</dt>
            </div>
          ))}
        </dl>
        <LogoMarquee className="mt-12" />
      </Container>
    </Band>
  );
}

// ── Scene slots: copy eager, animated body lazy ────────────────────────────────

function SceneSlot({
  Scene,
  children,
}: {
  Scene: LazyExoticComponent<ComponentType>;
  children: ReactNode;
}) {
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

function StoryPlaceholder() {
  return (
    <section aria-labelledby="story-title" className="h-[240svh] md:h-[320svh]">
      <Container className="pt-24">
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
      </Container>
    </section>
  );
}

function TimelinePlaceholder() {
  return (
    <section aria-labelledby="timeline-title" className="min-h-[120svh] md:h-[180svh]">
      <Container className="pt-24">
        <Kicker>Deadlines</Kicker>
        <h2 id="timeline-title" className="mt-2 font-display text-h1 text-fg">
          {TIMELINE.title}
        </h2>
        <p className="mt-3 max-w-prose text-body-lg text-fg-secondary">{TIMELINE.line}</p>
      </Container>
    </section>
  );
}

function SignalsPlaceholder() {
  return (
    <div
      aria-labelledby="signals-title"
      className="mx-auto grid min-h-[48rem] max-w-content gap-12 px-gutter py-24 md:grid-cols-2 md:min-h-[36rem]"
    >
      <div>
        <Eyebrow>{SIGNALS.eyebrow}</Eyebrow>
        <h2 id="signals-title" className="mk-display-sm mt-3 text-fg">
          {SIGNALS.title}
        </h2>
        <p className="mk-lede mt-4 max-w-prose text-fg-secondary">{SIGNALS.line}</p>
      </div>
      <div>
        <Eyebrow>{SIGNALS.tracker.eyebrow}</Eyebrow>
        <h3 className="mk-display-sm mt-3 text-fg">{SIGNALS.tracker.title}</h3>
        <p className="mk-lede mt-4 max-w-prose text-fg-secondary">{SIGNALS.tracker.line}</p>
      </div>
    </div>
  );
}

function ExplainerPlaceholder() {
  return (
    <section
      id="explainer"
      aria-labelledby="explainer-title"
      className="min-h-[56rem] md:min-h-[44rem]"
    >
      <Container className="py-24">
        <Kicker>Fit score</Kicker>
        <h2 id="explainer-title" className="mt-2 font-display text-h1 text-fg">
          {EXPLAINER.title}
        </h2>
        <p className="mt-3 max-w-prose text-body-lg text-fg-secondary">{EXPLAINER.line}</p>
      </Container>
    </section>
  );
}

// ── Honesty + FAQ (the one light band) ─────────────────────────────────────────

function Honesty() {
  return (
    <Band tone="paper" aria-labelledby="privacy-title">
      <Container className="grid gap-14 py-24 md:grid-cols-2 md:gap-16 md:py-32">
        <m.div
          variants={variants.reveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
        >
          <Eyebrow>{PRIVACY.eyebrow}</Eyebrow>
          <h2 id="privacy-title" className="mk-display-sm mt-3 text-fg">
            {PRIVACY.title}
          </h2>
          <p className="mk-lede mt-4 max-w-prose text-fg-secondary">{PRIVACY.body}</p>
          <dl className="mt-8 divide-y divide-border-subtle border-y border-border-subtle">
            {PRIVACY.facts.map((fact) => (
              <div key={fact.title} className="grid gap-1 py-4 sm:grid-cols-[9rem_1fr] sm:gap-6">
                <dt className="text-body font-medium text-fg">{fact.title}</dt>
                <dd className="text-body text-fg-secondary">{fact.body}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 max-w-prose text-body text-fg-secondary">{PRIVACY.dont}</p>
        </m.div>
        <m.div
          variants={variants.reveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >
          <Eyebrow>Questions</Eyebrow>
          <h2 className="mk-display-sm mt-3 text-fg">Straight answers.</h2>
          <Faq items={FAQ} className="mt-6" />
        </m.div>
      </Container>
    </Band>
  );
}

// ── Finale: the beam swings onto the glass card ────────────────────────────────

function Finale() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const phone = useIsPhone();
  const flags = useMotionValue(0);
  useEffect(() => flags.set((reduced ? 1 : 0) + (phone ? 2 : 0)), [flags, reduced, phone]);
  const { finale } = landing;
  const { scrollYProgress: p } = useScroll({ target: ref, offset: finale.offset });
  const [scrolledLit, setScrolledLit] = useState(false);
  useMotionValueEvent(p, 'change', (v) => setScrolledLit(v >= finale.lightsAt));
  const lit = reduced || scrolledLit;

  return (
    <Band tone="night" grid={false} aria-labelledby="finale-title">
      <div
        ref={ref}
        className="mx-auto grid min-h-svh max-w-content items-center gap-12 px-gutter py-24 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-16"
      >
        <div className="relative mx-auto size-36 md:mx-0 md:size-56 md:justify-self-center lg:size-64">
          <BeaconMark className="relative size-full text-fg" />
        </div>
        <m.div
          data-lit={lit || undefined}
          animate={lit ? { scale: 1, y: 0 } : { scale: 0.985, y: 6 }}
          transition={springs.smooth}
          className={cn(
            'mk-cta-card flex flex-col items-start gap-6 p-7 md:p-10',
            !lit && 'opacity-90',
          )}
        >
          <Eyebrow>Get started</Eyebrow>
          <h2 id="finale-title" className="mk-display text-balance text-fg">
            {FINALE.title}
          </h2>
          <p className="mk-lede max-w-prose text-fg-secondary">{FINALE.line}</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button asChild variant="primary" size="lg" className="mk-btn-light group gap-2">
              <Link to="/login" data-testid="finale-cta">
                {FINALE.cta}
                <ArrowRight
                  className="size-4 transition-transform duration-fast group-hover:translate-x-0.5"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </Link>
            </Button>
            <Link
              to="/features"
              className="mk-btn-ghost-dark press inline-flex h-control-lg items-center rounded-sm px-3 text-body focus-visible:focus-ring"
            >
              Explore every feature
            </Link>
          </div>
          <p className="text-caption text-fg-tertiary">{HERO.caption}</p>
        </m.div>
      </div>
    </Band>
  );
}

export function LandingScreen() {
  useBrandAccent();
  return (
    <div data-testid="landing-page" className="min-h-dvh bg-bg text-fg">
      <Seo page={PUBLIC_PAGES.home} />
      <MarketingNav />
      <main id="main" tabIndex={-1} className="outline-none">
        <Hero />
        <Proof />
        <Band tone="wash" wash="b" grid={false} id="how" aria-labelledby="story-title">
          <SceneSlot Scene={StoryScene}>
            <StoryPlaceholder />
          </SceneSlot>
        </Band>
        <Band tone="paper" aria-labelledby="timeline-title">
          <SceneSlot Scene={TimelineScene}>
            <TimelinePlaceholder />
          </SceneSlot>
        </Band>
        <Band tone="wash" wash="c" grid={false} aria-labelledby="signals-title">
          <SceneSlot Scene={SignalsScene}>
            <SignalsPlaceholder />
          </SceneSlot>
        </Band>
        <Band tone="wash" wash="a" grid={false} aria-labelledby="explainer-title">
          <SceneSlot Scene={ExplainerScene}>
            <ExplainerPlaceholder />
          </SceneSlot>
        </Band>
        <Honesty />
        <Finale />
      </main>
      <MarketingFooter />
    </div>
  );
}
