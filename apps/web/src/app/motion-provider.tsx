import { springs, toReducedMotion } from '@kestrel/ui';
import { domAnimation, LazyMotion, MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

import { useTheme } from '@/lib/theme/context';

const loadDomMax = () => import('@/lib/motion-features').then((m) => m.default);

/**
 * Root motion context (MOTION §2): `m.*` components only (`strict`), `domAnimation` synchronously,
 * `MotionConfig.reducedMotion` from Settings > Appearance > Motion, default transition `springs.snappy`.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  const { appearance } = useTheme();
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion={toReducedMotion(appearance.motion)} transition={springs.snappy}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}

/** App routes: upgrade to `domMax` (layout, `layoutId`, drag), fetched lazily after first paint. */
export function FullMotionFeatures({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadDomMax} strict>
      {children}
    </LazyMotion>
  );
}
