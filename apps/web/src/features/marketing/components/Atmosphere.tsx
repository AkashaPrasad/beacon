/**
 * Atmosphere for the public site: full-bleed bands with grain, a dotted radar grid, range rings, a lamp
 * (the mark's dot at room scale) and the sweeping beam. All layers are static paints or compositor-only
 * transforms (marketing.css); ambient loops pause off-screen and stop under reduced motion.
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type BandTone = 'night' | 'tint' | 'paper' | 'wash';

interface BandProps {
  tone?: BandTone;
  /** Where the lamp sits, as CSS percentages of the band. */
  lamp?: { x: string; y: string };
  /** Show the dotted radar grid and range rings. */
  grid?: boolean;
  /** Show the beam (sweeping unless reduced motion). */
  beam?: boolean;
  /** Beam direction in degrees (0 = pointing right, 90 = down). */
  beamDir?: number;
  beamSwing?: number;
  /** Wash hue rotation for `tone="wash"` so neighbouring bands differ. */
  wash?: 'a' | 'b' | 'c';
  id?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  'aria-labelledby'?: string;
}

/** Pauses every ambient loop inside while the band is off-screen (`[data-paused]`, marketing.css). */
function usePauseOffscreen(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) node.removeAttribute('data-paused');
          else node.setAttribute('data-paused', '');
        }
      },
      { rootMargin: '20% 0px' },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [ref]);
}

export function Band({
  tone = 'night',
  lamp,
  grid = tone !== 'paper',
  beam = false,
  beamDir = 152,
  beamSwing = 14,
  wash = 'a',
  id,
  className,
  style,
  children,
  ...rest
}: BandProps) {
  const ref = useRef<HTMLElement>(null);
  usePauseOffscreen(ref);
  const vars = {
    ...(lamp ? { '--mk-src-x': lamp.x, '--mk-src-y': lamp.y } : {}),
    '--mk-beam-dir': `${beamDir}deg`,
    '--mk-beam-swing': `${beamSwing}deg`,
    ...style,
  } as CSSProperties;
  return (
    <section
      ref={ref}
      id={id}
      style={vars}
      data-wash={tone === 'wash' ? wash : undefined}
      className={cn(
        'mk-band',
        tone === 'night' && 'mk-band-night bg-bg text-fg',
        tone === 'tint' && 'mk-band-tint bg-bg text-fg',
        tone === 'paper' && 'mk-band-paper bg-bg text-fg',
        tone === 'wash' && 'mk-band-wash bg-bg text-fg',
        className,
      )}
      {...rest}
    >
      <div aria-hidden="true" className="mk-layer mk-grain" />
      {grid && <div aria-hidden="true" className="mk-layer mk-dots" />}
      {grid && lamp && <div aria-hidden="true" className="mk-layer mk-rings" />}
      {lamp && <div aria-hidden="true" className="mk-glow" />}
      {lamp && beam && (
        <>
          <div aria-hidden="true" className="mk-beam mk-beam-spill" data-sweep="" />
          <div aria-hidden="true" className="mk-beam" data-sweep="" />
        </>
      )}
      {lamp && (
        <div aria-hidden="true" className="mk-lamp">
          <span className="mk-ping" />
          <span className="mk-ping" />
          <span className="mk-lamp-core" />
        </div>
      )}
      {children}
    </section>
  );
}

/** Small uppercase label above a heading. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('mk-eyebrow inline-flex items-center gap-2', className)}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
      {children}
    </p>
  );
}

/** Container widths used by every public page. */
export function Container({
  children,
  className,
  narrow,
}: {
  children: ReactNode;
  className?: string;
  narrow?: boolean;
}) {
  return (
    <div
      className={cn('mx-auto w-full px-gutter', narrow ? 'max-w-3xl' : 'max-w-content', className)}
    >
      {children}
    </div>
  );
}
