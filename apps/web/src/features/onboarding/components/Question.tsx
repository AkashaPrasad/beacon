import { ArrowLeft, ChevronDown, CornerDownLeft, Loader2 } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { Button } from '@/components/ui/button';
import { useOnboarding } from '@/features/onboarding/flow/context';
import { LIVE_FITS_MIN, useLiveFits } from '@/features/onboarding/flow/live-fits';
import { eyebrowFor, positionOf, type StepId } from '@/features/onboarding/flow/steps';
import { inlineReveal, rowVariants } from '@/features/onboarding/lib/motion';
import type { ProfileDraft } from '@/features/profile/lib/profile-model';
import { cn } from '@kestrel/ui';

import { useAnnounce } from './Chrome';

export interface PrimaryAction {
  label?: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  pending?: boolean;
  /** Shown beside a disabled button: what's still needed. */
  hint?: ReactNode;
}

export interface SkipAction {
  /** The button says what skipping means ("Skip — no minimum"). */
  label: string;
  onSkip: () => void;
}

export interface QuestionProps {
  step: StepId;
  prompt: ReactNode;
  /** Plain-text prompt for the announcer (defaults to `prompt` when it's a string). */
  promptText?: string;
  helper?: ReactNode;
  /** "Why we ask" disclosure. */
  why?: ReactNode;
  children?: ReactNode;
  primary?: PrimaryAction | null;
  skip?: SkipAction | null;
  footnote?: ReactNode;
  width?: 'md' | 'lg';
  /** Render the answer without the e2 panel (the step draws its own single panel). */
  bare?: boolean;
  /** Element that should receive focus on arrival (else the first field, else the prompt). */
  autoFocusSelector?: string;
  /** The profile this answer would produce, for the live "≈ N open fits" line. */
  liveDraft?: ProfileDraft | null;
  /** First options page only: "Tip: press 1–6 to pick, Enter to continue." */
  tip?: string | null;
}

const NOT_ENTER_TARGETS =
  'textarea,a,select,[contenteditable="true"],[role="combobox"][aria-expanded="true"],[role="listbox"],[data-enter="self"]';

/**
 * One question per page (UX-RESTRUCTURE §3): a big prompt in the serif, one helper line, an optional
 * "Why we ask", the answer, and the actions (soft Back · Skip with its consequence · primary + ↵). Enter
 * continues from anywhere except multi-line fields and open lists; Alt+← goes back.
 */
export function Question({
  step,
  prompt,
  promptText,
  helper,
  why,
  children,
  primary,
  skip,
  footnote,
  width = 'md',
  bare = false,
  autoFocusSelector,
  liveDraft,
  tip,
}: QuestionProps) {
  const flow = useOnboarding();
  const announce = useAnnounce();
  const root = useRef<HTMLElement>(null);
  const titleId = useId();
  const helperId = useId();
  const [whyOpen, setWhyOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const { index, total } = positionOf(step, flow.sequence);
  const text = promptText ?? (typeof prompt === 'string' ? prompt : '');
  const eyebrow = eyebrowFor(step, {
    firstName: flow.firstName,
    index,
    resumed: flow.resumed,
    mode: flow.mode,
  });
  const fits = useLiveFits(liveDraft ?? null);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const target =
      (autoFocusSelector ? el.querySelector<HTMLElement>(autoFocusSelector) : null) ??
      el.querySelector<HTMLElement>('[data-autofocus]') ??
      el.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([tabindex="-1"]),[role="radio"][tabindex="0"],[role="checkbox"][tabindex="0"],button[aria-pressed][tabindex="0"]',
      ) ??
      el.querySelector<HTMLElement>('h1');
    target?.focus({ preventScroll: true });
    // Arrival only; focus must settle before the user can start tabbing or typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!text) return;
    announce(flow.mode === 'edit' ? text : `Step ${index} of ${total}. ${text}`);
  }, [announce, flow.mode, index, total, text]);

  async function runPrimary() {
    if (!primary || primary.disabled || primary.pending || running) return;
    setRunning(true);
    try {
      await primary.onClick();
    } finally {
      setRunning(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.nativeEvent.isComposing) return;
    // Option cards and chips swallow Enter's native click (Space toggles them) and let it continue here.
    if (e.defaultPrevented && !(e.target as HTMLElement).closest('[data-option]')) return;
    if (e.key === 'ArrowLeft' && e.altKey && flow.canGoBack(step)) {
      e.preventDefault();
      flow.back(step);
      return;
    }
    if (e.key !== 'Enter' || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    const target = e.target as HTMLElement;
    if (target.closest(NOT_ENTER_TARGETS)) return;
    // Buttons other than option cards keep their own Enter (Back, Skip, Why we ask…).
    if (target.closest('button') && !target.closest('[data-option]')) return;
    e.preventDefault();
    void runPrimary();
  }

  const pending = Boolean(primary?.pending) || running;
  const showBack = flow.canGoBack(step);

  return (
    <section
      ref={root}
      onKeyDown={onKeyDown}
      aria-labelledby={titleId}
      className={cn(
        'mx-auto flex min-h-[calc(100dvh-3.75rem)] w-full flex-col px-gutter pt-10 sm:pt-16',
        width === 'lg' ? 'max-w-[52rem]' : 'max-w-[40rem]',
      )}
    >
      <div className="flex flex-col gap-3">
        {eyebrow && (
          <p
            className="text-caption font-medium uppercase tracking-wider text-fg-tertiary"
            data-testid="onboarding-eyebrow"
          >
            {eyebrow}
          </p>
        )}
        <h1
          id={titleId}
          tabIndex={-1}
          className="font-serif text-display text-balance text-fg outline-none max-sm:text-[2rem] max-sm:leading-[1.1]"
          data-testid="onboarding-prompt"
        >
          {prompt}
        </h1>
        {helper && (
          <p id={helperId} className="max-w-prose text-body-lg text-fg-secondary text-pretty">
            {helper}
          </p>
        )}
        {why && (
          <div>
            <button
              type="button"
              aria-expanded={whyOpen}
              onClick={() => setWhyOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-xs text-small text-fg-tertiary transition-colors duration-fast hover:text-fg focus-visible:focus-ring"
              data-testid="onboarding-why"
            >
              Why we ask
              <ChevronDown
                className={cn(
                  'size-3.5 transition-transform duration-fast',
                  whyOpen && 'rotate-180',
                )}
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </button>
            <AnimatePresence initial={false}>
              {whyOpen && (
                <m.p
                  key="why"
                  {...inlineReveal}
                  className="mt-2 max-w-prose text-small text-fg-secondary"
                >
                  {why}
                </m.p>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      <m.div className="mt-8" variants={rowVariants} custom={3} initial="hidden" animate="visible">
        <div
          className={cn(
            'flex flex-col gap-5',
            !bare && 'e2 rounded-xl border border-border-subtle p-4 sm:p-6',
          )}
          role="group"
          aria-labelledby={titleId}
          aria-describedby={helper ? helperId : undefined}
          data-testid="onboarding-answer"
        >
          {children}
        </div>
      </m.div>

      {liveDraft !== undefined && fits !== null && (
        <p
          className="mt-4 text-center text-small text-fg-secondary"
          aria-live="polite"
          data-testid="onboarding-live-fits"
        >
          {fits >= LIVE_FITS_MIN ? (
            <>
              ≈{' '}
              <span className="font-mono tabular-nums text-fg">{fits.toLocaleString('en-IN')}</span>{' '}
              open fits so far
            </>
          ) : (
            'Your packs are still filling in — this number will grow.'
          )}
        </p>
      )}
      {tip && (
        <p className="mt-4 hidden text-center text-caption text-fg-tertiary pointer-fine:block">
          {tip}
        </p>
      )}
      {footnote && <div className="mt-6 text-small text-fg-tertiary">{footnote}</div>}

      <div className="flex-1" />

      <div
        className={cn(
          'sticky bottom-0 z-sticky -mx-gutter mt-10 flex flex-col gap-2 px-gutter pt-3 pb-safe sm:static sm:mx-0 sm:px-0 sm:pb-10',
          'max-sm:glass max-sm:border-t',
        )}
        data-testid="onboarding-actions"
      >
        <div className="flex items-center gap-2 pb-3 sm:pb-0">
          {showBack ? (
            <Button
              variant="ghost"
              size="md"
              onClick={() => flow.back(step)}
              data-testid="onboarding-back"
              aria-keyshortcuts="Alt+ArrowLeft"
              className="max-sm:px-2.5"
            >
              <ArrowLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />
              <span className="max-sm:sr-only">Back</span>
            </Button>
          ) : (
            <span aria-hidden="true" />
          )}
          <div className="min-w-0 flex-1 text-right text-small text-fg-tertiary" aria-live="polite">
            {primary?.disabled && primary.hint ? (
              <span data-testid="onboarding-hint">{primary.hint}</span>
            ) : null}
          </div>
          {skip && (
            <Button
              variant="ghost"
              size="md"
              onClick={skip.onSkip}
              disabled={pending}
              data-testid="onboarding-skip"
              className="h-auto min-h-control max-w-[14rem] whitespace-normal py-1.5 text-left leading-snug max-sm:max-w-[10rem] max-sm:text-small"
            >
              {skip.label}
            </Button>
          )}
          {primary && (
            <Button
              variant="primary"
              size="lg"
              onClick={() => void runPrimary()}
              disabled={primary.disabled || pending}
              aria-busy={pending || undefined}
              aria-keyshortcuts="Enter"
              data-testid="onboarding-continue"
              className="min-w-32"
            >
              {pending ? (
                <Loader2
                  className="size-4 animate-spin motion-reduce:animate-none"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              ) : null}
              {primary.label ?? 'Continue'}
              {!pending && (
                <CornerDownLeft
                  className="hidden size-3.5 opacity-70 lg:inline"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              )}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
