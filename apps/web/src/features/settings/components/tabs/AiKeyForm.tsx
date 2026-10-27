import { CircleCheck, CircleX, ClipboardPaste, Eye, EyeOff, KeyRound, Loader2, Plug } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { useAiKeyRequests, useRemoveAiKey } from '@/api/settings';
import { Button } from '@/components/ui/button';
import { inlineReveal } from '@/features/onboarding/lib/motion';
import { ConfirmDialog } from '@/features/settings/components/controls/ConfirmDialog';
import { Field } from '@/features/settings/components/controls/Field';
import { inputClass } from '@/features/settings/components/controls/styles';
import {
  isKeyProvider,
  KEY_PROVIDERS,
  maskedKey,
  PROVIDER_PRESETS,
  validateKeyForm,
  type KeyProvider,
} from '@/features/settings/lib/ai';
import { errorMessage, isApiError } from '@/lib/api';
import type { AiSettings } from '@kestrel/shared';
import { cn } from '@kestrel/ui';

type TestState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok'; latencyMs: number; model?: string }
  | { kind: 'fail'; message: string };

function testFailureMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.code === 'AI_NOT_CONFIGURED') return 'Add a key to test it.';
    if (error.status === 429) return 'Too many tests this hour. Try again later.';
    if (error.code === 'TIMEOUT') return 'No response within 15 s. Check the base URL.';
  }
  return errorMessage(error, 'The test didn’t finish. Try again.');
}

export interface AiKeyFormProps {
  ai: AiSettings;
  onSaved?: () => void;
}

/**
 * Bring your own key (USERFLOW §5.2): provider preset or custom OpenAI-compatible endpoint, base URL,
 * model and key, [Test connection], [Save key]. The key lives only in this component's state until it
 * is sent; afterwards only "stored, ending ••••3f9a" is shown, with [Replace] and [Remove].
 */
export function AiKeyForm({ ai, onSaved }: AiKeyFormProps) {
  const requests = useAiKeyRequests();
  const urlRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef<HTMLInputElement>(null);
  const savedProvider: KeyProvider = isKeyProvider(ai.provider) ? ai.provider : 'openai';
  const [provider, setProvider] = useState<KeyProvider>(savedProvider);
  const [baseUrl, setBaseUrl] = useState(ai.baseUrl ?? PROVIDER_PRESETS[savedProvider].baseUrl);
  const [model, setModel] = useState(ai.model ?? '');
  const [apiKey, setApiKey] = useState('');
  const [reveal, setReveal] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [test, setTest] = useState<TestState>({ kind: 'idle' });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<ReturnType<typeof validateKeyForm>>(null);

  const preset = PROVIDER_PRESETS[provider];
  const hasStoredKey = ai.hasKey && provider === savedProvider;
  const showKeyInput = !hasStoredKey || replacing;
  const canPaste = typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function';

  function changeProvider(next: KeyProvider) {
    const previous = PROVIDER_PRESETS[provider];
    setProvider(next);
    // Follow the preset unless the user typed their own URL.
    if (!baseUrl.trim() || baseUrl === previous.baseUrl) setBaseUrl(PROVIDER_PRESETS[next].baseUrl);
    setTest({ kind: 'idle' });
    setErrors(null);
  }

  async function runTest() {
    setTest({ kind: 'testing' });
    try {
      const result = await requests.test({
        provider,
        baseUrl: baseUrl.trim() || null,
        model: model.trim() || null,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      });
      setTest(
        result.ok
          ? { kind: 'ok', latencyMs: result.latencyMs, model: result.model }
          : { kind: 'fail', message: result.error ?? 'The provider didn’t accept this configuration.' },
      );
    } catch (error) {
      setTest({ kind: 'fail', message: testFailureMessage(error) });
    }
  }

  async function save() {
    const found = validateKeyForm({ provider, baseUrl, model, apiKey, hasKey: hasStoredKey && !replacing });
    setErrors(found);
    if (found) {
      (found.baseUrl ? urlRef : keyRef).current?.focus();
      return;
    }
    setSaving(true);
    try {
      await requests.save({
        provider,
        baseUrl: baseUrl.trim(),
        model: model.trim() || null,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        enabled: true,
      });
      // Drop the key from memory as soon as it has been sent.
      setApiKey('');
      setReveal(false);
      setReplacing(false);
      toast.success(apiKey.trim() ? 'Key saved. Only its last four characters are kept visible.' : 'Provider saved.');
      onSaved?.();
    } catch (error) {
      toast.error(errorMessage(error, 'Couldn’t save the key. Try again.'), { duration: 8000 });
    } finally {
      setSaving(false);
    }
  }

  async function paste() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) setApiKey(text);
    } catch {
      toast('Couldn’t read the clipboard. Paste with ⌘V or Ctrl V instead.');
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border border-border bg-surface-raised p-4" data-testid="settings-ai-key-form">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Provider">
          {({ controlId }) => (
            <select
              id={controlId}
              data-testid="settings-ai-provider"
              value={provider}
              onChange={(e) => changeProvider(e.target.value as KeyProvider)}
              className={cn(inputClass, 'appearance-auto')}
            >
              {KEY_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_PRESETS[p].label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Model" hint="Optional" error={errors?.model}>
          {({ controlId, describedBy }) => (
            <input
              id={controlId}
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder={preset.modelHint}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              aria-describedby={describedBy}
              aria-invalid={Boolean(errors?.model) || undefined}
              data-testid="settings-ai-model"
              className={cn(inputClass, 'font-mono text-mono')}
            />
          )}
        </Field>
      </div>

      <Field label="Base URL" help="OpenAI-compatible chat completions endpoint." error={errors?.baseUrl}>
        {({ controlId, describedBy }) => (
          <input
            id={controlId}
            ref={urlRef}
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://api.example.com/v1"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            aria-describedby={describedBy}
            aria-invalid={Boolean(errors?.baseUrl) || undefined}
            data-testid="settings-ai-base-url"
            className={cn(inputClass, 'font-mono text-mono')}
          />
        )}
      </Field>

      {showKeyInput ? (
        <Field
          label="API key"
          hint={preset.keyOptional ? 'Optional' : undefined}
          help="Encrypted at rest (AES-256-GCM). After saving, only the last four characters are shown."
          error={errors?.apiKey}
        >
          {({ controlId, describedBy }) => (
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <KeyRound
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-tertiary"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <input
                  id={controlId}
                  ref={keyRef}
                  type={reveal ? 'text' : 'password'}
                  name="beacon-ai-key"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-1p-ignore=""
                  data-lpignore="true"
                  placeholder={preset.keyHint}
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    if (test.kind !== 'idle') setTest({ kind: 'idle' });
                  }}
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(errors?.apiKey) || undefined}
                  data-testid="settings-ai-key-input"
                  className={cn(inputClass, 'pr-10 pl-9 font-mono text-mono')}
                />
                <button
                  type="button"
                  onClick={() => setReveal((r) => !r)}
                  aria-pressed={reveal}
                  aria-label={reveal ? 'Hide key' : 'Show key'}
                  disabled={!apiKey}
                  className="hit-area absolute top-1/2 right-1 grid size-7 -translate-y-1/2 place-items-center rounded-sm text-fg-tertiary transition-colors duration-fast hover:bg-surface-hover hover:text-fg focus-visible:focus-ring disabled:opacity-40"
                >
                  {reveal ? <EyeOff className="size-4" strokeWidth={1.5} /> : <Eye className="size-4" strokeWidth={1.5} />}
                </button>
              </div>
              {canPaste && (
                <Button variant="secondary" size="md" onClick={() => void paste()} aria-label="Paste key from clipboard">
                  <ClipboardPaste className="size-4" strokeWidth={1.5} aria-hidden="true" />
                  <span className="max-sm:sr-only">Paste</span>
                </Button>
              )}
            </div>
          )}
        </Field>
      ) : (
        <div className="flex flex-col gap-1.5">
          <span className="text-body font-medium text-fg">API key</span>
          <StoredKey ai={ai} onReplace={() => setReplacing(true)} onRemoved={onSaved} />
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => void runTest()}
            disabled={test.kind === 'testing'}
            aria-busy={test.kind === 'testing' || undefined}
            data-testid="settings-ai-test"
          >
            {test.kind === 'testing' ? (
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <Plug className="size-4" strokeWidth={1.5} aria-hidden="true" />
            )}
            Test connection
          </Button>
          {showKeyInput || provider !== savedProvider || baseUrl !== (ai.baseUrl ?? '') || model !== (ai.model ?? '') ? (
            <Button variant="primary" onClick={() => void save()} disabled={saving} aria-busy={saving || undefined} data-testid="settings-ai-save">
              {saving && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" strokeWidth={1.5} aria-hidden="true" />}
              {showKeyInput ? 'Save key' : 'Save changes'}
            </Button>
          ) : null}
          {replacing && (
            <Button
              variant="ghost"
              onClick={() => {
                setReplacing(false);
                setApiKey('');
                setErrors(null);
              }}
            >
              Cancel
            </Button>
          )}
        </div>
        <div aria-live="polite" className="min-w-0 flex-1">
          <AnimatePresence initial={false} mode="popLayout">
            {test.kind === 'ok' && (
              <m.p
                key="ok"
                {...inlineReveal}
                className="flex items-center gap-1.5 text-small text-success"
                data-testid="settings-ai-test-result"
                data-ok="true"
              >
                <CircleCheck className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                Works · <span className="font-mono text-mono-sm">{test.latencyMs} ms</span>
                {test.model && <span className="truncate font-mono text-mono-sm text-fg-tertiary">{test.model}</span>}
              </m.p>
            )}
            {test.kind === 'fail' && (
              <m.p
                key="fail"
                {...inlineReveal}
                className="flex items-start gap-1.5 text-small text-danger"
                data-testid="settings-ai-test-result"
                data-ok="false"
              >
                <CircleX className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                {test.message}
              </m.p>
            )}
          </AnimatePresence>
        </div>
      </div>

    </div>
  );
}

/**
 * The stored key, masked ("Stored, ending ••••3f9a") with [Replace] and [Remove]. Removing asks first:
 * the key can't be recovered, only pasted again.
 */
export function StoredKey({
  ai,
  onReplace,
  onRemoved,
}: {
  ai: AiSettings;
  onReplace?: () => void;
  onRemoved?: () => void;
}) {
  const removeKey = useRemoveAiKey();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-sm border border-border bg-surface px-3 py-2">
      <KeyRound className="size-4 shrink-0 text-fg-tertiary" strokeWidth={1.5} aria-hidden="true" />
      <p className="min-w-0 flex-1 text-body text-fg" data-testid="settings-ai-key">
        Stored, ending <span className="font-mono text-mono">{maskedKey(ai.keyLast4)}</span>
        {isKeyProvider(ai.provider) && (
          <span className="text-small text-fg-tertiary"> · {PROVIDER_PRESETS[ai.provider].label}</span>
        )}
      </p>
      {onReplace && (
        <Button variant="ghost" size="sm" onClick={onReplace} data-testid="settings-ai-key-replace">
          Replace
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setConfirm(true)}
        data-testid="settings-ai-key-remove"
        className="text-danger hover:text-danger"
      >
        Remove
      </Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Remove your API key?"
        description={`Beacon forgets the key ending ${ai.keyLast4 ?? ''} and falls back to the choice you made at sign-up. You'll need to paste it again to use it.`}
        confirmLabel="Remove key"
        pending={removeKey.isPending}
        data-testid="settings-ai-key-remove-dialog"
        confirmTestId="settings-ai-key-remove-confirm"
        onConfirm={() =>
          removeKey.mutate(undefined, {
            onSuccess: ({ ai: next }) => {
              setConfirm(false);
              toast(next.enabled ? "Key removed. Beacon's AI is back on." : 'Key removed. AI is off until you add one.');
              onRemoved?.();
            },
            onError: (error) => toast.error(errorMessage(error, 'Couldn’t remove the key. Try again.'), { duration: 8000 }),
          })
        }
      />
    </div>
  );
}
