import { CircleCheck, CircleX, Globe, Loader2, Plus, X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useId, useState } from 'react';

import { useCreateSource, useDetectSource } from '@/api';
import { Button } from '@/components/ui/button';
import { describeDetection, toDetectableUrl } from '@/features/onboarding/lib/detect';
import { chipMotion, inlineReveal } from '@/features/onboarding/lib/motion';
import { inputClass } from '@/features/settings/components/controls/styles';
import { isApiError } from '@/lib/api';
import { cn, CompanyLogo } from '@kestrel/ui';

function useDebouncedValue<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export interface AddedSource {
  id: string;
  url: string;
  name: string;
  domain: string | null;
}

export interface SourceUrlDetectorProps {
  added: readonly AddedSource[];
  onAdded: (source: AddedSource) => void;
  onRemove: (source: AddedSource) => void;
}

/**
 * "Add your own URL" with live detection (debounced 400 ms, the same rules as the Sources dialog).
 * The result line springs in: "Detected: Greenhouse board stripe → 142 jobs".
 */
export function SourceUrlDetector({ added, onAdded, onRemove }: SourceUrlDetectorProps) {
  const inputId = useId();
  const resultId = useId();
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const url = toDetectableUrl(text);
  const debounced = useDebouncedValue(url, 400);
  const settled = debounced === url;
  const detect = useDetectSource(debounced);
  const create = useCreateSource();

  const result = settled ? detect.data : undefined;
  const described = result ? describeDetection(result) : null;
  const detecting = Boolean(url) && (!settled || detect.isFetching);
  const failed = settled && Boolean(url) && detect.isError;
  const showInvalid = touched && text.trim().length > 0 && !url;

  async function add() {
    if (!result || !url) return;
    setAddError(null);
    try {
      const res = await create.mutateAsync({
        url: result.finalUrl ?? result.url ?? url,
        name: result.name ?? result.companyName ?? undefined,
        kind: result.kind,
        boardToken: result.boardToken,
        feedUrl: result.config?.feedUrl ?? null,
        preview: result,
      });
      onAdded({
        id: res.source.id,
        url: res.source.url,
        name: res.source.name,
        domain: res.source.companyDomain ?? result.companyDomain,
      });
      setText('');
      setTouched(false);
    } catch (error) {
      setAddError(
        isApiError(error) && error.status === 409
          ? 'Already added. It’s in your Sources.'
          : isApiError(error)
            ? error.message
            : 'Couldn’t add this source. Try again.',
      );
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="onboarding-own-url">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-small text-fg-secondary">
          Paste a careers page{' '}
          <span className="text-caption font-normal text-fg-tertiary">Optional</span>
        </label>
        <div className="relative">
          <Globe
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-tertiary"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <input
            id={inputId}
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="boards.greenhouse.io/stripe or acme.dev/careers"
            data-testid="source-add-url"
            value={text}
            aria-invalid={showInvalid || undefined}
            aria-describedby={resultId}
            onChange={(e) => {
              setText(e.target.value);
              setAddError(null);
            }}
            onBlur={() => setTouched(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (described?.action) void add();
              }
            }}
            className={cn(inputClass, 'pl-9 font-mono text-mono')}
          />
        </div>
      </div>

      <div id={resultId} aria-live="polite" className="min-h-0">
        <AnimatePresence initial={false} mode="popLayout">
          {showInvalid ? (
            <m.p
              key="invalid"
              {...inlineReveal}
              className="text-small text-danger"
              data-testid="source-detect-result"
              data-tone="invalid"
            >
              Enter a web address, like acme.dev/careers.
            </m.p>
          ) : detecting ? (
            <m.p
              key="detecting"
              {...inlineReveal}
              className="flex items-center gap-2 font-mono text-mono-sm text-fg-tertiary"
              data-testid="source-detect-result"
              data-tone="detecting"
            >
              <Loader2
                className="size-4 animate-spin motion-reduce:animate-none"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              Detecting…
            </m.p>
          ) : failed ? (
            <m.p
              key="error"
              {...inlineReveal}
              className="flex items-start gap-2 text-small text-danger"
              data-testid="source-detect-result"
              data-tone="failure"
            >
              <CircleX className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
              We couldn&apos;t find listings on that page. Try the company&apos;s careers page, or a
              Greenhouse, Lever or Ashby link.
            </m.p>
          ) : described && result ? (
            <m.div
              key={`result-${result.url}`}
              {...inlineReveal}
              data-testid="source-detect-result"
              data-tone={described.tone}
              className={cn(
                'flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center',
                described.tone === 'failure'
                  ? 'border-danger/40 bg-danger-subtle'
                  : 'border-border bg-surface-raised',
              )}
            >
              <div className="flex min-w-0 flex-1 items-start gap-2">
                {described.tone === 'success' ? (
                  <CircleCheck
                    className="mt-0.5 size-4 shrink-0 text-success"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                ) : described.tone === 'crawl' ? (
                  <Globe
                    className="mt-0.5 size-4 shrink-0 text-fg-tertiary"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                ) : (
                  <CircleX
                    className="mt-0.5 size-4 shrink-0 text-danger"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                )}
                <div className="min-w-0">
                  <p
                    className={cn(
                      'text-small',
                      described.tone === 'success'
                        ? 'font-mono text-mono text-fg'
                        : 'text-fg-secondary',
                    )}
                  >
                    {described.text}
                  </p>
                  {result.finalUrl && result.finalUrl !== url && (
                    <p className="truncate font-mono text-mono-sm text-fg-tertiary">
                      Redirects to {result.finalUrl.replace(/^https?:\/\//, '')}
                    </p>
                  )}
                </div>
              </div>
              {described.action && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void add()}
                  disabled={create.isPending}
                  data-testid="source-add-submit"
                  className="self-start sm:self-auto"
                >
                  {create.isPending ? (
                    <Loader2 className="size-4 animate-spin" strokeWidth={1.5} aria-hidden="true" />
                  ) : (
                    <Plus className="size-4" strokeWidth={1.5} aria-hidden="true" />
                  )}
                  {described.action}
                </Button>
              )}
            </m.div>
          ) : null}
        </AnimatePresence>
        {addError && (
          <p role="alert" className="mt-2 text-small text-danger">
            {addError}
          </p>
        )}
      </div>

      {added.length > 0 && (
        <ul
          className="flex flex-col gap-1.5"
          aria-label="Your sources"
          data-testid="onboarding-added-sources"
        >
          <AnimatePresence initial={false} mode="popLayout">
            {added.map((s) => (
              <m.li
                key={s.id}
                layout
                {...chipMotion}
                className="flex items-center gap-2 rounded-md border border-border bg-surface-raised py-1.5 pr-1.5 pl-2"
              >
                <CompanyLogo name={s.name} domain={s.domain} size={20} />
                <span className="min-w-0 flex-1 truncate text-body text-fg">{s.name}</span>
                <span className="hidden truncate font-mono text-mono-sm text-fg-tertiary sm:block">
                  {s.url.replace(/^https?:\/\//, '')}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${s.name}`}
                  onClick={() => onRemove(s)}
                >
                  <X className="size-4" strokeWidth={1.5} aria-hidden="true" />
                </Button>
              </m.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
