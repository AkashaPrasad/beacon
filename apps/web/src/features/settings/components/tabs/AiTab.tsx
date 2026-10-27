import { CircleCheck, CircleDashed, KeyRound, Lightbulb, PowerOff } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useId, useState } from 'react';
import { toast } from 'sonner';

import { useUpdateSettings } from '@/api';
import { useAiUsage } from '@/api/settings';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { springs, tweens } from '@/features/onboarding/lib/motion';
import { RadioCards } from '@/features/settings/components/controls/RadioCards';
import { SettingsRow, SettingsSection } from '@/features/settings/components/SettingsRow';
import { AiKeyForm, StoredKey } from '@/features/settings/components/tabs/AiKeyForm';
import { aiStatus, providerLabel } from '@/features/settings/lib/ai';
import { useSavedFlash } from '@/features/settings/lib/use-saved-flash';
import { errorMessage } from '@/lib/api';
import type { Settings, SettingsPatch } from '@kestrel/shared';
import { cn, formatShortDate } from '@kestrel/ui';

function UsageMeter({ calls, cap, tokens }: { calls: number; cap: number; tokens?: { total: number } }) {
  const ratio = cap > 0 ? Math.min(1, calls / cap) : 0;
  const tone = ratio >= 1 ? 'bg-danger' : ratio >= 0.8 ? 'bg-warning' : 'bg-fg-secondary';
  return (
    <div className="flex max-w-sm flex-col gap-1.5" data-testid="settings-ai-usage">
      <p className="text-body text-fg">
        <span className="font-mono text-mono">{calls.toLocaleString('en-IN')}</span>
        <span className="text-fg-tertiary"> of </span>
        <span className="font-mono text-mono">{cap.toLocaleString('en-IN')}</span>
        <span className="text-fg-secondary"> AI calls today</span>
      </p>
      <div
        role="meter"
        aria-label="AI calls used today"
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-valuenow={calls}
        aria-valuetext={`${calls} of ${cap}`}
        className="h-1 overflow-hidden rounded-full bg-surface-sunken"
      >
        <m.div
          className={cn('h-full origin-left rounded-full', tone)}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: ratio }}
          transition={springs.data}
        />
      </div>
      {tokens && (
        <p className="font-mono text-mono-sm text-fg-tertiary">{tokens.total.toLocaleString('en-IN')} tokens · resets 00:00 UTC</p>
      )}
    </div>
  );
}

/**
 * Settings > AI & keys (DESIGN §10.6, USERFLOW §5.2): one honest status line, the master switch, the
 * provider (Beacon's or your own key), resume consent and today's usage. AI-off keeps everything that
 * doesn't need a model working, and says so.
 */
export function AiTab({ settings }: { settings: Settings }) {
  const ai = settings.ai;
  const update = useUpdateSettings();
  const [saved, flash] = useSavedFlash();
  const [choice, setChoice] = useState<'beacon' | 'byok' | null>(null);
  const usage = useAiUsage({ enabled: ai.enabled });
  const status = aiStatus(ai);
  const provider = choice ?? (ai.provider === 'default' ? 'beacon' : 'byok');
  const ids = { consent: useId() };

  function patch(body: SettingsPatch, message?: string) {
    update.mutate(body, {
      onSuccess: () => {
        flash();
        if (message) toast(message);
      },
      onError: (error) => toast.error(errorMessage(error, 'Couldn’t save that. Try again.'), { duration: 8000 }),
    });
  }

  const StatusIcon = status.tone === 'on' ? CircleCheck : status.tone === 'pending' ? CircleDashed : PowerOff;

  return (
    <SettingsSection
      title="AI & keys"
      description="Use Beacon's AI, bring your own key, or switch AI off. Matching works either way."
      saved={saved}
      data-testid="settings-ai"
    >
      <div
        role="status"
        data-testid="settings-ai-status"
        data-tone={status.tone}
        className={cn(
          'mt-4 flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-small',
          status.tone === 'off' ? 'border-info/30 bg-info-subtle text-info' : 'border-border bg-surface-raised text-fg-secondary',
        )}
      >
        <StatusIcon
          className={cn('mt-0.5 size-4 shrink-0', status.tone === 'on' && 'text-success')}
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <span>{status.text}</span>
      </div>

      <SettingsRow label="Use AI" help="Off: embeddings and rules only. Everything except tailoring tips still works.">
        {({ labelId, helpId }) => (
          <Switch
            checked={ai.enabled}
            onCheckedChange={(enabled) =>
              patch({ ai: { enabled } }, enabled ? undefined : 'AI is off. Matching uses embeddings and rules.')
            }
            aria-labelledby={labelId}
            aria-describedby={helpId}
            data-testid="settings-ai-enabled"
          />
        )}
      </SettingsRow>

      <AnimatePresence initial={false} mode="popLayout">
        {ai.enabled ? (
          <m.div
            key="on"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: tweens.fadeIn }}
            exit={{ opacity: 0, transition: tweens.fadeOut }}
            className="flex flex-col"
          >
            <SettingsRow label="Provider" help="Your key is used for your requests only." stacked>
              {({ labelId }) => (
                <div className="flex flex-col gap-3">
                  <RadioCards
                    aria-labelledby={labelId}
                    data-testid="settings-ai-provider-choice"
                    value={provider}
                    className="sm:grid-cols-2"
                    options={[
                      {
                        value: 'beacon',
                        icon: Lightbulb,
                        title: "Beacon's AI",
                        description: "Meta's Model API, free contributor tier. Meta may use prompts to improve its models.",
                        testId: 'settings-ai-choice-beacon',
                      },
                      {
                        value: 'byok',
                        icon: KeyRound,
                        title: 'Your own key',
                        description: 'Any OpenAI-compatible provider: OpenAI, Gemini, OpenRouter, Ollama or custom.',
                        testId: 'settings-ai-choice-byok',
                      },
                    ]}
                    onChange={(next) => {
                      setChoice(next);
                      if (next === 'beacon' && ai.provider !== 'default') {
                        patch({ ai: { provider: 'default' } }, "Switched to Beacon's AI.");
                      }
                    }}
                  />
                  <AnimatePresence initial={false} mode="popLayout">
                    {provider === 'byok' && (
                      <m.div
                        key="byok"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0, transition: { y: springs.smooth, opacity: tweens.fadeIn } }}
                        exit={{ opacity: 0, transition: tweens.fadeOut }}
                      >
                        <AiKeyForm ai={ai} onSaved={flash} />
                      </m.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </SettingsRow>

            <SettingsRow
              label="Resume text"
              help={`Lets ${provider === 'beacon' ? "Meta's Model API" : 'your provider'} read your resume to extract skills and explain fits.`}
            >
              {({ helpId }) =>
                ai.consentGivenAt ? (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="settings-ai-consent" data-given="true">
                    <p className="flex items-center gap-1.5 text-body text-fg">
                      <CircleCheck className="size-4 text-success" strokeWidth={1.5} aria-hidden="true" />
                      Allowed since <span className="font-mono text-mono">{formatShortDate(ai.consentGivenAt)}</span>
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        patch(
                          { ai: { consent: false }, privacy: { sendResumeToAi: false } },
                          'Consent withdrawn. Your resume stays on Beacon.',
                        )
                      }
                      data-testid="settings-ai-consent-withdraw"
                    >
                      Withdraw
                    </Button>
                  </div>
                ) : (
                  <label className="flex items-start gap-2.5 text-body text-fg" data-testid="settings-ai-consent" data-given="false">
                    <Checkbox
                      id={ids.consent}
                      checked={false}
                      aria-describedby={helpId}
                      className="mt-0.5"
                      onCheckedChange={(on) => {
                        if (on === true) patch({ ai: { consent: true }, privacy: { sendResumeToAi: true } });
                      }}
                    />
                    <span>
                      I agree that my resume text is sent to{' '}
                      {provider === 'beacon' ? 'Meta' : providerLabel(ai.provider === 'default' ? 'custom' : ai.provider)} for this.
                    </span>
                  </label>
                )
              }
            </SettingsRow>

            {usage.data && (
              <SettingsRow label="Today" help="Each listing explanation or resume read is one call.">
                {() => <UsageMeter calls={usage.data!.calls} cap={usage.data!.cap} tokens={usage.data!.tokens} />}
              </SettingsRow>
            )}
          </m.div>
        ) : (
          <m.div
            key="off"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: tweens.fadeIn }}
            exit={{ opacity: 0, transition: tweens.fadeOut }}
            className="flex flex-col"
          >
            {ai.hasKey && (
              <SettingsRow label="Stored key" help="Kept encrypted while AI is off. Turn AI on to use it again.">
                {() => <StoredKey ai={ai} onRemoved={flash} />}
              </SettingsRow>
            )}
          </m.div>
        )}
      </AnimatePresence>

      <p className="mt-4 max-w-prose text-small text-fg-tertiary">
        What’s sent: with AI on, your resume text (if you agree above) and the listings you open go to the provider you
        choose. Keys are encrypted at rest and only their last four characters are ever shown. Embeddings for matching
        are computed by Beacon either way.
      </p>
    </SettingsSection>
  );
}
