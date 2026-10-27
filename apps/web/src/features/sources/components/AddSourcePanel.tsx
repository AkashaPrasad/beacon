import { Link2, Plus } from 'lucide-react';
import { AnimatePresence, m, useAnimate } from 'motion/react';
import { useId, useState, type KeyboardEvent, type Ref } from 'react';
import { toast } from 'sonner';

import { useCreateSource, type CreateSourceVariables, type SourceRow } from '@/api/sources';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { errorMessage, isApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  OPPORTUNITY_TYPE_LABELS,
  OPPORTUNITY_TYPES,
  type OpportunityType,
  type RefreshInterval,
} from '@kestrel/shared';
import { durations, springs, tweens, usePrefersReducedMotion } from '@kestrel/ui';

import { DetectPanel } from './DetectPanel';
import {
  canSubmit,
  candidateUrl,
  estimateDailyCredits,
  type DetectError,
  type DetectState,
} from '../lib/detect-machine';
import { markSourceJustAdded } from '../lib/just-added';
import { INTERVAL_OPTIONS } from '../lib/rows';
import { useSourceDetection } from '../lib/use-detect';

const ANY = 'any';

function defaultInterval(state: DetectState): RefreshInterval {
  if (state.status === 'crawl') return 'daily';
  if (state.status === 'detected' && state.result.kind === 'rss') return 'daily';
  return '6h';
}

function existingIdOf(error: unknown): string | undefined {
  if (!isApiError(error)) return undefined;
  const details = error.details as { existingId?: unknown } | undefined;
  return typeof details?.existingId === 'string' ? details.existingId : undefined;
}

/**
 * The Sources hero action (UX restructure v2 §2.5): "Add a source" as a URL field that is always
 * there at the top of the page. Detection runs 400 ms after a valid URL (or at once on paste / Enter),
 * the result shows with a preview, and only then do "Tag as" and "Check" appear (progressive). Add
 * inserts the row optimistically at the top of the list and clears the field for the next one.
 * `n` focuses the field; pasting a link anywhere on the page (outside a field) fills it.
 */
export function AddSourcePanel({
  prefill,
  inputRef,
  existing,
  creditsPaused,
  onShowExisting,
  className,
}: {
  /** A URL to put in the field (`?add=<url>`, a pasted link, "Replace the URL"); `nonce` re-applies the same URL. */
  prefill: { url: string; nonce: number } | null;
  inputRef: Ref<HTMLInputElement>;
  existing: readonly SourceRow[];
  creditsPaused: boolean;
  onShowExisting: (id: string) => void;
  className?: string;
}) {
  // A new key remounts the form: empty after an add, prefilled (and focused) for a prefill.
  const [added, setAdded] = useState(0);
  const [addedAtNonce, setAddedAtNonce] = useState(prefill?.nonce ?? 0);
  const nonce = prefill?.nonce ?? 0;
  if (addedAtNonce !== nonce) {
    setAddedAtNonce(nonce);
    setAdded(0);
  }
  return (
    <section
      aria-label="Add a source"
      data-testid="source-add-dialog"
      className={cn('e2 rounded-xl border border-border-subtle p-3 sm:p-4', className)}
    >
      <AddSourceForm
        key={`${nonce}:${added}`}
        initialUrl={added === 0 ? (prefill?.url ?? '') : ''}
        autoFocus={prefill !== null || added > 0}
        inputRef={inputRef}
        existing={existing}
        creditsPaused={creditsPaused}
        onAdded={() => setAdded((n) => n + 1)}
        onShowExisting={onShowExisting}
      />
    </section>
  );
}

function AddSourceForm({
  initialUrl,
  autoFocus,
  inputRef,
  existing,
  creditsPaused,
  onAdded,
  onShowExisting,
}: {
  initialUrl: string;
  autoFocus: boolean;
  inputRef: Ref<HTMLInputElement>;
  existing: readonly SourceRow[];
  creditsPaused: boolean;
  onAdded: () => void;
  onShowExisting: (id: string) => void;
}) {
  const inputId = useId();
  const hintId = useId();
  const {
    state,
    setInput: setDetectInput,
    retry,
    detectNow,
    reset,
  } = useSourceDetection(initialUrl);
  const create = useCreateSource();
  const [typeTag, setTypeTag] = useState<string>(ANY);
  const [interval, setIntervalValue] = useState<RefreshInterval | null>(null);
  /** The server's verdict on submit (409 "Already added"), shown in the detection region. */
  const [submitError, setSubmitError] = useState<DetectError | null>(null);
  const [fieldRef, animateField] = useAnimate<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();
  /** Invalid input: x ±3 px, 2 cycles, 240 ms (MOTION §4: the only shake in the product). */
  const shake = () => {
    if (reduced || !fieldRef.current) return;
    void animateField(
      fieldRef.current,
      { x: [0, -3, 3, -3, 3, 0] },
      { duration: durations.slow, ease: 'linear' },
    );
  };
  const setInput = (value: string) => {
    setSubmitError(null);
    setDetectInput(value);
  };

  const effectiveInterval = interval ?? defaultInterval(state);
  const resultUrl =
    state.status === 'detected' || state.status === 'crawl'
      ? (state.result.finalUrl ?? state.url)
      : null;
  /** Client-side hint only: the server decides (409) when the user submits anyway. */
  const duplicate = resultUrl
    ? existing.find(
        (s) =>
          !s.optimistic &&
          (candidateUrl(s.url) === candidateUrl(resultUrl) ||
            candidateUrl(s.url) === candidateUrl(state.input)),
      )
    : undefined;

  const submit = () => {
    if (!canSubmit(state) || (state.status !== 'detected' && state.status !== 'crawl')) {
      if (state.status === 'typing' && state.url) detectNow();
      else shake();
      return;
    }
    if (create.isPending || submitError) return;
    const { result } = state;
    const url = result.finalUrl ?? state.url;
    const name = result.name ?? result.companyName ?? undefined;
    const body: CreateSourceVariables = {
      url,
      ...(name ? { name } : {}),
      typeTag: typeTag === ANY ? null : (typeTag as OpportunityType),
      refreshInterval: effectiveInterval,
      kind: result.kind,
      boardToken: result.config.boardToken ?? result.boardToken,
      feedUrl: result.config.feedUrl,
      preview: result,
    };

    // `mutateAsync`, not `mutate(…, callbacks)`: the form unmounts when it folds away, and per-call
    // callbacks never fire after their observer unmounts (the toasts would be lost).
    if (duplicate) {
      // Probably one we already watch: wait for the server with the form open, no optimistic row.
      void create.mutateAsync({ ...body, optimistic: false }).then(
        ({ source }) => {
          markSourceJustAdded(source.url);
          toast.success(`Added ${source.name}. Checking it now.`);
          onAdded();
        },
        (error: unknown) => {
          if (isApiError(error) && error.status === 409) {
            setSubmitError({
              kind: 'duplicate',
              message: 'Already added. You already watch this page.',
              existingId: existingIdOf(error) ?? duplicate.id,
            });
          } else {
            toast.error(`Couldn't add the source. ${errorMessage(error)}`, { duration: 8000 });
          }
        },
      );
      return;
    }

    markSourceJustAdded(url);
    void create.mutateAsync(body).then(
      ({ source }) => toast.success(`Added ${source.name}. Checking it now.`),
      (error: unknown) => {
        if (isApiError(error) && error.status === 409) {
          const existingId = existingIdOf(error);
          toast(
            'Already added.',
            existingId
              ? { action: { label: 'Show it', onClick: () => onShowExisting(existingId) } }
              : {},
          );
        } else {
          toast.error(`Couldn't add the source. ${errorMessage(error)}`, { duration: 8000 });
        }
      },
    );
    onAdded();
  };

  const shownState: DetectState = submitError
    ? {
        status: 'error',
        input: state.input,
        url: 'url' in state ? state.url : null,
        result: 'result' in state ? state.result : null,
        error: submitError,
      }
    : state;
  const hint = state.status === 'typing' ? state.hint : null;
  const ready = canSubmit(shownState);
  const creditsPerDay = estimateDailyCredits(effectiveInterval);

  /** Esc clears the field (a second Esc leaves it). */
  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    e.stopPropagation();
    if (state.input) {
      e.preventDefault();
      setSubmitError(null);
      reset();
    } else if (e.target instanceof HTMLElement) {
      e.target.blur();
    }
  };

  return (
    <form
      // Native `type=url` validation would block "boards.greenhouse.io/stripe" (no scheme); the
      // detection state machine is the validator.
      noValidate
      className="flex flex-col gap-3"
      onKeyDown={onKeyDown}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex items-start gap-2">
        <div ref={fieldRef} data-testid="sources-add-url" className="relative min-w-0 flex-1">
          {/* The leading icon is the field's label: clicking it focuses the field. */}
          <label
            htmlFor={inputId}
            data-testid="sources-add-button"
            className="absolute inset-y-0 left-0 z-raised grid w-11 cursor-text place-items-center text-fg-tertiary"
          >
            <Link2 className="size-4" strokeWidth={1.5} aria-hidden="true" />
            <span className="sr-only">Add a source</span>
          </label>
          <Input
            ref={inputRef}
            id={inputId}
            data-testid="source-add-url"
            type="text"
            inputMode="url"
            autoComplete="url"
            autoCapitalize="off"
            spellCheck={false}
            autoFocus={autoFocus}
            aria-keyshortcuts="N"
            placeholder="Paste a careers page, job board or hackathon site…"
            className="h-11 pl-11 text-body"
            value={state.input}
            aria-describedby={hint ? hintId : `${inputId}-about`}
            aria-invalid={shownState.status === 'error' || undefined}
            onChange={(e) => setInput(e.target.value)}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text');
              if (text && !candidateUrl(text)) shake();
            }}
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          data-testid="source-add-submit"
          disabled={!ready}
          aria-busy={create.isPending || undefined}
          className="h-11 px-4"
        >
          <Plus strokeWidth={1.75} /> {shownState.status === 'crawl' ? 'Add anyway' : 'Add'}
        </Button>
      </div>
      {hint ? (
        <p id={hintId} className="px-1 text-small text-fg-tertiary">
          {hint}
        </p>
      ) : (
        <p
          id={`${inputId}-about`}
          className={cn('px-1 text-small text-fg-tertiary', state.status !== 'idle' && 'sr-only')}
        >
          A careers page, a Greenhouse, Lever or Ashby board, or a feed. Beacon picks the cheapest
          way to read it.
        </p>
      )}

      <DetectPanel
        state={shownState}
        creditsPerDay={creditsPerDay}
        creditsPaused={creditsPaused}
        duplicate={!submitError && duplicate ? { id: duplicate.id, name: duplicate.name } : null}
        onRetry={retry}
        onShowExisting={onShowExisting}
      />

      <AnimatePresence initial={false}>
        {ready ? (
          <m.div
            key="options"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0, transition: springs.smooth }}
            exit={{ opacity: 0, transition: tweens.exit }}
            className="grid gap-3 sm:grid-cols-2"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${inputId}-tag`}>Tag as</Label>
              <Select value={typeTag} onValueChange={setTypeTag}>
                <SelectTrigger id={`${inputId}-tag`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Detect from each listing</SelectItem>
                  {OPPORTUNITY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {OPPORTUNITY_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${inputId}-interval`}>Check</Label>
              <Select
                value={effectiveInterval}
                onValueChange={(v) => setIntervalValue(v as RefreshInterval)}
              >
                <SelectTrigger id={`${inputId}-interval`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERVAL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>

      {ready ? (
        <p className="px-1 text-caption text-fg-tertiary">
          {shownState.status === 'crawl'
            ? `Costs about ${creditsPerDay} crawl ${creditsPerDay === 1 ? 'credit' : 'credits'} a day from your budget.`
            : 'Free to watch: job-board APIs and feeds never use crawl credits.'}
        </p>
      ) : null}
    </form>
  );
}
