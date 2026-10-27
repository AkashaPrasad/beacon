import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';

import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { springs, stepVariants, tweens } from '@/features/onboarding/lib/motion';
import {
  StepActionsContext,
  visibleSignature,
  type StepActions,
  type StepActionsRegistry,
} from '@/features/onboarding/lib/step-actions';
import { STEP_LABELS, STEPS, stepIndex, type StepId } from '@/features/onboarding/lib/steps';
import { cn } from '@kestrel/ui';

function StepHeader({ step }: { step: StepId }) {
  const index = stepIndex(step);
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-small" aria-label="Onboarding steps">
        {STEPS.map((s, i) => {
          const done = i < index;
          const current = i === index;
          return (
            <li key={s} className="flex items-center gap-1.5">
              {i > 0 && (
                <span aria-hidden="true" className="text-fg-disabled">
                  ·
                </span>
              )}
              <span
                aria-current={current ? 'step' : undefined}
                data-testid={`onboarding-step-label-${s}`}
                className={cn(
                  'inline-flex items-center gap-1.5 transition-colors duration-fast',
                  current ? 'font-medium text-fg' : done ? 'text-fg-secondary' : 'text-fg-tertiary',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid size-5 place-items-center rounded-full font-mono text-mono-sm transition-colors duration-fast',
                    current ? 'bg-accent text-accent-fg' : done ? 'bg-surface-sunken text-fg-secondary' : 'border border-border text-fg-tertiary',
                  )}
                >
                  {done ? <Check className="size-3" strokeWidth={2.25} /> : i + 1}
                </span>
                {STEP_LABELS[s]}
                {done && <span className="sr-only">(done)</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <div
        role="progressbar"
        aria-label="Onboarding progress"
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={index + 1}
        aria-valuetext={`Step ${index + 1} of ${STEPS.length}: ${STEP_LABELS[step]}`}
        className="h-0.5 overflow-hidden rounded-full bg-surface-sunken"
      >
        <m.div
          className="h-full origin-left bg-accent-strong"
          initial={false}
          animate={{ scaleX: (index + 1) / STEPS.length }}
          transition={springs.smooth}
        />
      </div>
    </div>
  );
}

export interface OnboardingFrameProps {
  step: StepId;
  /** +1 forward, -1 back. */
  direction: 1 | -1;
  onBack?: (() => void) | null;
  children: ReactNode;
}

/**
 * Onboarding frame (USERFLOW §1.3): step header with a 2 px progress line, the step content (which
 * slides in the direction of travel), and a persistent action bar ([Back] · [Skip for now] · primary).
 * `Enter` continues when focus is not in a multi-line field; `Esc` does nothing on purpose.
 */
export function OnboardingFrame({ step, direction, onBack, children }: OnboardingFrameProps) {
  const handlers = useRef(new Map<StepId, StepActions>());
  const [visible, setVisible] = useState<Partial<Record<StepId, StepActions>>>({});
  const [running, setRunning] = useState<'continue' | 'skip' | null>(null);

  const register = useCallback<StepActionsRegistry['register']>((id, actions) => {
    if (actions) handlers.current.set(id, actions);
    else handlers.current.delete(id);
    // Re-render only when something visible changed; handlers are always read from the ref.
    setVisible((prev) => {
      if (visibleSignature(prev[id]) === visibleSignature(actions)) return prev;
      const next = { ...prev };
      if (actions) next[id] = actions;
      else delete next[id];
      return next;
    });
  }, []);
  const registry = useMemo(() => ({ register }), [register]);

  const actions = visible[step] ?? null;

  const run = useCallback(
    async (kind: 'continue' | 'skip') => {
      const a = handlers.current.get(step);
      const fn = kind === 'continue' ? a?.onContinue : a?.onSkip;
      if (!fn || running) return;
      setRunning(kind);
      try {
        await fn();
      } finally {
        setRunning(null);
      }
    },
    [step, running],
  );

  // Back to the top of the page on every step change (content is replaced, not appended).
  const topRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    topRef.current?.scrollIntoView({ block: 'start' });
  }, [step]);

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Enter' || e.defaultPrevented || e.nativeEvent.isComposing) return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    const target = e.target as HTMLElement;
    if (target.closest('textarea,button,a,select,[contenteditable="true"],[role="combobox"],[role="listbox"]'))
      return;
    if (actions?.disabled) return;
    e.preventDefault();
    void run('continue');
  }

  const continuePending = Boolean(actions?.pending) || running === 'continue';
  const skipPending = Boolean(actions?.skipPending) || running === 'skip';
  const label = actions?.continueLabel ?? 'Continue';

  return (
    <StepActionsContext.Provider value={registry}>
      <div
        data-testid="onboarding-page"
        data-step={step}
        onKeyDown={onKeyDown}
        className="relative flex min-h-dvh flex-col bg-bg"
      >
        <div ref={topRef} className="scroll-mt-0" />
        <header className="mx-auto w-full max-w-content px-gutter pt-6 pb-2 sm:pt-10">
          <StepHeader step={step} />
        </header>

        <main id="main" className="relative mx-auto w-full max-w-content flex-1 overflow-x-clip px-gutter pb-8">
          <AnimatePresence initial={false} mode="popLayout" custom={direction}>
            <m.div
              key={step}
              custom={direction}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="w-full"
              data-testid={`onboarding-step-${step}`}
            >
              {children}
            </m.div>
          </AnimatePresence>
        </main>

        <footer
          className="sticky bottom-0 z-sticky border-t border-border-subtle bg-bg pb-safe"
          data-testid="onboarding-actions"
        >
          <div className="mx-auto flex w-full max-w-content items-center gap-2 px-gutter py-3">
            {onBack ? (
              <Button
                variant="ghost"
                size="md"
                onClick={onBack}
                data-testid="onboarding-back"
                className="max-sm:px-2.5"
              >
                <ArrowLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />
                <span className="max-sm:sr-only">Back</span>
              </Button>
            ) : (
              <span aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1" aria-live="polite">
              <AnimatePresence initial={false} mode="popLayout">
                {actions?.meta && (
                  <m.p
                    key={actions.meta}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: tweens.fadeIn }}
                    exit={{ opacity: 0, transition: tweens.fadeOut }}
                    className="hidden truncate text-small text-fg-tertiary sm:block"
                    data-testid="onboarding-meta"
                  >
                    {actions.meta}
                  </m.p>
                )}
              </AnimatePresence>
            </div>
            {actions?.onSkip && (
              <Button
                variant="ghost"
                size="md"
                onClick={() => void run('skip')}
                disabled={skipPending || continuePending}
                data-testid="onboarding-skip"
              >
                {skipPending && <Loader2 className="size-4 animate-spin" strokeWidth={1.5} aria-hidden="true" />}
                Skip for now
              </Button>
            )}
            <Button
              variant="primary"
              size="md"
              onClick={() => void run('continue')}
              disabled={!actions || actions.disabled || continuePending || skipPending}
              aria-busy={continuePending || undefined}
              data-testid="onboarding-continue"
              className="min-w-28"
            >
              <span className={cn('inline-flex items-center gap-2', continuePending && 'opacity-0')}>
                {label}
                <Kbd className="hidden border-accent-fg/20 bg-transparent text-accent-fg/80 lg:inline-flex">↵</Kbd>
              </span>
              {continuePending && (
                <span className="absolute inset-0 grid place-items-center">
                  <Loader2 className="size-4 animate-spin" strokeWidth={1.5} aria-hidden="true" />
                  <span className="sr-only">Saving</span>
                </span>
              )}
            </Button>
          </div>
        </footer>
      </div>
    </StepActionsContext.Provider>
  );
}
