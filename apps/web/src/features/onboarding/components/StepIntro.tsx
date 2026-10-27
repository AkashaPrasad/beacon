import type { Ref } from 'react';

import { cn } from '@kestrel/ui';

export interface StepIntroProps {
  title: string;
  why: string;
  className?: string;
  ref?: Ref<HTMLHeadingElement>;
}

/**
 * Step title in `display` (Instrument Serif) with a one-line "why" in `body-lg fg-secondary`
 * (USERFLOW §1.3). The heading takes focus after a step change so screen readers announce the step.
 */
export function StepIntro({ title, why, className, ref }: StepIntroProps) {
  return (
    <div className={cn('flex max-w-prose flex-col gap-2', className)}>
      <h1 ref={ref} tabIndex={-1} className="font-display text-display text-balance text-fg outline-none">
        {title}
      </h1>
      <p className="text-body-lg text-fg-secondary">{why}</p>
    </div>
  );
}
