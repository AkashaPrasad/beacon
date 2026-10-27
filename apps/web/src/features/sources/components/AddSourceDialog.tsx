import { OPPORTUNITY_TYPE_LABELS, OPPORTUNITY_TYPES, type OpportunityType, type RefreshInterval } from '@kestrel/shared';
import { durations, usePrefersReducedMotion } from '@kestrel/ui';
import { Link2 } from 'lucide-react';
import { useAnimate } from 'motion/react';
import { useId, useState } from 'react';
import { toast } from 'sonner';

import { canSubmit, candidateUrl, estimateDailyCredits, type DetectState } from '../lib/detect-machine';
import { markSourceJustAdded } from '../lib/just-added';
import { INTERVAL_OPTIONS } from '../lib/rows';
import { useSourceDetection } from '../lib/use-detect';

import { DetectPanel } from './DetectPanel';

import { useCreateSource, type SourceRow } from '@/api/sources';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { errorMessage, isApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

const ANY = 'any';

function defaultInterval(state: DetectState): RefreshInterval {
  if (state.status === 'crawl') return 'daily';
  if (state.status === 'detected' && state.result.kind === 'rss') return 'daily';
  return '6h';
}

/**
 * Add-source dialog (DESIGN §10.5, USERFLOW §5.1). Full-screen sheet on phones. Live detection is
 * debounced 400 ms after a valid URL; Add inserts the row optimistically at the top of the table.
 */
export function AddSourceDialog({
  open,
  onOpenChange,
  existing,
  creditsPaused,
  onShowExisting,
  initialUrl,
}: {
  /** Prefill (e.g. "Replace URL" from the edit dialog, or `?add=<url>`). */
  initialUrl?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: readonly SourceRow[];
  creditsPaused: boolean;
  onShowExisting: (id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="source-add-dialog"
        className={cn(
          'flex max-h-[min(44rem,calc(100dvh-2rem))] flex-col gap-4 overflow-y-auto sm:max-w-xl',
          'max-sm:inset-0 max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0 max-sm:pb-[max(1.5rem,env(safe-area-inset-bottom))]',
        )}
      >
        {open ? (
          <AddSourceForm
            initialUrl={initialUrl ?? ''}
            existing={existing}
            creditsPaused={creditsPaused}
            onDone={() => onOpenChange(false)}
            onShowExisting={(id) => {
              onOpenChange(false);
              onShowExisting(id);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AddSourceForm({
  initialUrl,
  existing,
  creditsPaused,
  onDone,
  onShowExisting,
}: {
  initialUrl: string;
  existing: readonly SourceRow[];
  creditsPaused: boolean;
  onDone: () => void;
  onShowExisting: (id: string) => void;
}) {
  const inputId = useId();
  const hintId = useId();
  const { state, setInput, retry, detectNow } = useSourceDetection(initialUrl);
  const create = useCreateSource();
  const [typeTag, setTypeTag] = useState<string>(ANY);
  const [interval, setIntervalValue] = useState<RefreshInterval | null>(null);
  const [fieldRef, animateField] = useAnimate<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();
  /** Invalid input: x ±3 px, 2 cycles, 240 ms (MOTION §4: the only shake in the product). */
  const shake = () => {
    if (reduced || !fieldRef.current) return;
    void animateField(fieldRef.current, { x: [0, -3, 3, -3, 3, 0] }, { duration: durations.slow, ease: 'linear' });
  };

  const effectiveInterval = interval ?? defaultInterval(state);
  const resultUrl =
    state.status === 'detected' || state.status === 'crawl' ? (state.result.finalUrl ?? state.url) : null;
  const duplicate = resultUrl
    ? existing.find((s) => candidateUrl(s.url) === candidateUrl(resultUrl) || candidateUrl(s.url) === candidateUrl(state.input))
    : undefined;


  const submit = () => {
    if (!canSubmit(state) || (state.status !== 'detected' && state.status !== 'crawl')) {
      if (state.status === 'typing' && state.url) detectNow();
      else shake();
      return;
    }
    if (duplicate) return;
    const { result } = state;
    const url = result.finalUrl ?? state.url;
    const tag = typeTag === ANY ? null : (typeTag as OpportunityType);
    markSourceJustAdded(url);
    const name = result.name ?? result.companyName ?? undefined;
    create.mutate(
      {
        url,
        ...(name ? { name } : {}),
        typeTag: tag,
        refreshInterval: effectiveInterval,
        kind: result.kind,
        boardToken: result.config.boardToken ?? result.boardToken,
        feedUrl: result.config.feedUrl,
        preview: result,
      },
      {
        onSuccess: ({ source }) => toast.success(`Added ${source.name}. Checking it now.`),
        onError: (error) => {
          if (isApiError(error) && error.status === 409) {
            const existingId = (error.details as { existingId?: string } | undefined)?.existingId;
            toast('Already added.', existingId ? { action: { label: 'Show it', onClick: () => onShowExisting(existingId) } } : {});
          } else {
            toast.error(`Couldn't add the source. ${errorMessage(error)}`, { duration: 8000 });
          }
        },
      },
    );
    onDone();
  };

  const shownState: DetectState =
    duplicate && (state.status === 'detected' || state.status === 'crawl')
      ? {
          status: 'error',
          input: state.input,
          url: state.url,
          result: state.result,
          error: { kind: 'duplicate', message: 'Already added. You already watch this page.', existingId: duplicate.id },
        }
      : state;
  const hint = state.status === 'typing' ? state.hint : null;
  const ready = canSubmit(shownState);
  const creditsPerDay = estimateDailyCredits(effectiveInterval);

  return (
    <form
      className="flex min-h-0 flex-1 flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>Add a source</DialogTitle>
        <DialogDescription>
          Paste a careers page, a Greenhouse, Lever or Ashby board, or a feed. Beacon picks the cheapest way to read it.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={inputId}>URL</Label>
        <div ref={fieldRef} data-testid="sources-add-url" className="relative">
          <Link2
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-tertiary"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <Input
            id={inputId}
            data-testid="source-add-url"
            type="url"
            inputMode="url"
            autoComplete="url"
            autoCapitalize="off"
            spellCheck={false}
            autoFocus
            placeholder="https://boards.greenhouse.io/stripe"
            className="pl-9 font-mono text-mono"
            value={state.input}
            aria-describedby={hint ? hintId : undefined}
            aria-invalid={state.status === 'error' || undefined}
            onChange={(e) => setInput(e.target.value)}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text');
              if (text && !candidateUrl(text)) shake();
            }}
          />
        </div>
        {hint ? (
          <p id={hintId} className="text-small text-fg-tertiary">
            {hint}
          </p>
        ) : null}
      </div>

      <DetectPanel
        state={shownState}
        creditsPerDay={creditsPerDay}
        creditsPaused={creditsPaused}
        onRetry={retry}
        onShowExisting={onShowExisting}
      />

      <div className={cn('grid gap-3 sm:grid-cols-2', !ready && 'opacity-60')}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${inputId}-tag`}>Tag as</Label>
          <Select value={typeTag} onValueChange={setTypeTag} disabled={!ready}>
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
          <Label htmlFor={`${inputId}-interval`}>Refresh</Label>
          <Select value={effectiveInterval} onValueChange={(v) => setIntervalValue(v as RefreshInterval)} disabled={!ready}>
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
      </div>

      <p className="text-caption text-fg-tertiary">
        {shownState.status === 'crawl'
          ? `Cost: about ${creditsPerDay} crawl ${creditsPerDay === 1 ? 'credit' : 'credits'} a day from your budget.`
          : 'Cost: free for job-board APIs and feeds · crawled pages use credits.'}
      </p>

      <DialogFooter className="mt-auto gap-2 sm:justify-end">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" data-testid="source-add-submit" disabled={!ready || create.isPending}>
          {shownState.status === 'crawl' ? 'Add anyway' : 'Add source'}
        </Button>
      </DialogFooter>
    </form>
  );
}
