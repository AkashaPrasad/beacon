import { Download, KeyRound, Lightbulb, Loader2, PowerOff, Trash2 } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useId, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';

import { useMe, useUpdateMe, useUpdateSettings } from '@/api';
import { downloadExport, useDeleteAccount } from '@/api/settings';
import type { AiMode } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { CONSENT_VERSION } from '@/features/auth/consent';
import { inlineReveal } from '@/features/onboarding/lib/motion';
import { ConfirmDialog } from '@/features/settings/components/controls/ConfirmDialog';
import { RadioCards } from '@/features/settings/components/controls/RadioCards';
import { inputClass } from '@/features/settings/components/controls/styles';
import { SettingsRow, SettingsSection } from '@/features/settings/components/SettingsRow';
import { aiModeOf, isKeyProvider } from '@/features/settings/lib/ai';
import { useSavedFlash } from '@/features/settings/lib/use-saved-flash';
import { errorMessage } from '@/lib/api';
import type { Settings, SettingsPatch } from '@kestrel/shared';
import { cn, formatShortDate } from '@kestrel/ui';

/** What each consent choice means for settings (same mapping as the consent screen, plus "keep my key"). */
function settingsFor(mode: AiMode, resumeToAi: boolean, settings: Settings): SettingsPatch {
  switch (mode) {
    case 'beacon':
      return { ai: { provider: 'default', enabled: true, consent: resumeToAi }, privacy: { sendResumeToAi: resumeToAi } };
    case 'byok': {
      const usableKey = settings.ai.hasKey && isKeyProvider(settings.ai.provider);
      return { ai: { enabled: usableKey, consent: false }, privacy: { sendResumeToAi: false } };
    }
    case 'off':
      return { ai: { enabled: false, consent: false }, privacy: { sendResumeToAi: false } };
  }
}

const DELETE_WORD = 'DELETE';

function DeleteAccount() {
  const del = useDeleteAccount();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const inputId = useId();
  const matches = typed.trim() === DELETE_WORD;

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setTyped('');
          setOpen(true);
        }}
        className="border-danger/40 text-danger hover:border-danger hover:text-danger"
        data-testid="settings-delete-account"
      >
        <Trash2 className="size-4" strokeWidth={1.5} aria-hidden="true" />
        Delete account
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete your account?"
        description="Delete your account and all data? This removes your profile, resume, tracker and alert rules. This can't be undone. Type DELETE to confirm."
        confirmLabel="Delete account"
        confirmDisabled={!matches}
        pending={del.isPending}
        data-testid="settings-delete-dialog"
        confirmTestId="settings-delete-confirm"
        onConfirm={() =>
          del.mutate(undefined, {
            onSuccess: () => {
              setOpen(false);
              void navigate('/', { replace: true });
              toast('Your account and data were deleted.');
            },
            onError: (error) => toast.error(errorMessage(error, 'Couldn’t delete the account. Try again.'), { duration: 8000 }),
          })
        }
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor={inputId} className="text-small font-medium text-fg">
            Type <span className="font-mono text-mono">{DELETE_WORD}</span> to confirm
          </label>
          <input
            id={inputId}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches && !del.isPending) {
                e.preventDefault();
                (e.currentTarget.closest('[role="alertdialog"]')?.querySelector('[data-testid="settings-delete-confirm"]') as HTMLButtonElement | null)?.click();
              }
            }}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            data-testid="settings-delete-confirm-input"
            className={cn(inputClass, 'font-mono text-mono')}
          />
        </div>
      </ConfirmDialog>
    </>
  );
}

function ExportData() {
  const [state, setState] = useState<'idle' | 'preparing'>('idle');
  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button
        variant="secondary"
        disabled={state === 'preparing'}
        aria-busy={state === 'preparing' || undefined}
        data-testid="settings-export"
        onClick={() => {
          setState('preparing');
          downloadExport()
            .then(() => toast.success('Export downloaded'))
            .catch((error: unknown) => toast.error(errorMessage(error, "The export didn't finish. Try again."), { duration: 8000 }))
            .finally(() => setState('idle'));
        }}
      >
        {state === 'preparing' ? (
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" strokeWidth={1.5} aria-hidden="true" />
        ) : (
          <Download className="size-4" strokeWidth={1.5} aria-hidden="true" />
        )}
        {state === 'preparing' ? 'Preparing your export…' : 'Export my data'}
      </Button>
      <p className="font-mono text-mono-sm text-fg-tertiary">beacon-export-{new Date().toISOString().slice(0, 10)}.json</p>
    </div>
  );
}

/**
 * Settings > Privacy & data (DESIGN §10.6, USERFLOW §1.2 and §5.3): the consent choice (the same three
 * options as the consent screen), the resume-to-AI toggle, export as JSON, and account deletion behind
 * a typed confirmation.
 */
export function PrivacyTab({ settings }: { settings: Settings }) {
  const me = useMe();
  const updateMe = useUpdateMe();
  const update = useUpdateSettings();
  const [saved, flash] = useSavedFlash();
  const consent = me.data?.onboarding.consent ?? null;
  const current: AiMode = consent?.aiMode ?? aiModeOf(settings.ai);
  const [draft, setDraft] = useState<AiMode | null>(null);
  const [agree, setAgree] = useState(false);
  const [saving, setSaving] = useState(false);
  const ids = { choice: useId(), agree: useId() };
  const chosen = draft ?? current;
  const changed = draft !== null && draft !== current;
  const needsAgree = chosen === 'beacon' && changed;

  async function saveChoice() {
    if (!draft) return;
    setSaving(true);
    const resumeToAi = draft === 'beacon' ? agree : false;
    try {
      await updateMe.mutateAsync({ consent: { version: CONSENT_VERSION, aiMode: draft, resumeToAi } });
      await update.mutateAsync(settingsFor(draft, resumeToAi, settings));
      setDraft(null);
      setAgree(false);
      flash();
      toast(
        draft === 'off'
          ? 'AI is off. Matching uses embeddings and rules.'
          : draft === 'beacon'
            ? "Saved. Beacon's AI is on."
            : 'Saved. Add your key in AI & keys.',
      );
    } catch (error) {
      toast.error(errorMessage(error, 'Couldn’t save your choice. Try again.'), { duration: 8000 });
    } finally {
      setSaving(false);
    }
  }

  function patch(body: SettingsPatch) {
    update.mutate(body, {
      onSuccess: flash,
      onError: (error) => toast.error(errorMessage(error, 'Couldn’t save that. Try again.'), { duration: 8000 }),
    });
  }

  return (
    <div className="flex flex-col gap-10">
      <SettingsSection
        title="Privacy & data"
        description="Beacon never sells your data, shows ads or shares your profile with companies."
        saved={saved}
        data-testid="settings-privacy"
      >
        <SettingsRow label="How Beacon uses AI" help="The choice you made at sign-up. Change it any time." stacked>
          {({ labelId }) => (
            <div className="flex flex-col gap-3">
              <RadioCards
                aria-labelledby={labelId}
                data-testid="settings-privacy-ai"
                value={chosen}
                onChange={(next) => {
                  setDraft(next === current ? null : next);
                  if (next !== 'beacon') setAgree(false);
                }}
                options={[
                  {
                    value: 'beacon',
                    icon: Lightbulb,
                    title: "Use Beacon's AI",
                    description:
                      "Your resume text and the listings you open are sent to Meta's Model API to extract skills, explain fits and suggest tailoring tips. Meta's free contributor tier may use prompts to improve its models.",
                    testId: 'settings-privacy-ai-beacon',
                  },
                  {
                    value: 'byok',
                    icon: KeyRound,
                    title: 'Use my own API key',
                    description: 'Any OpenAI-compatible provider. Until a key is added, Beacon runs without AI.',
                    testId: 'settings-privacy-ai-byok',
                  },
                  {
                    value: 'off',
                    icon: PowerOff,
                    title: "Don't use AI",
                    description: 'Matching uses embeddings and rules only, so everything except tailoring tips still works.',
                    testId: 'settings-privacy-ai-off',
                  },
                ]}
              />
              <AnimatePresence initial={false}>
                {changed && (
                  <m.div key="save" {...inlineReveal} className="flex flex-col gap-3 rounded-md border border-border bg-surface-raised p-3">
                    {needsAgree && (
                      <label htmlFor={ids.agree} className="flex items-start gap-2.5 text-body text-fg">
                        <Checkbox
                          id={ids.agree}
                          checked={agree}
                          onCheckedChange={(v) => setAgree(v === true)}
                          className="mt-0.5"
                          data-testid="settings-privacy-agree"
                        />
                        <span>
                          I agree that my resume text is sent to Meta for this.{' '}
                          <span className="text-fg-tertiary">(required for this option)</span>
                        </span>
                      </label>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={saving || (needsAgree && !agree)}
                        aria-busy={saving || undefined}
                        onClick={() => void saveChoice()}
                        data-testid="settings-privacy-save"
                      >
                        {saving && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" strokeWidth={1.5} aria-hidden="true" />}
                        Save choice
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={saving}>
                        Keep current
                      </Button>
                    </div>
                  </m.div>
                )}
              </AnimatePresence>
              {consent && (
                <p className="font-mono text-mono-sm text-fg-tertiary" data-testid="settings-consent-record">
                  Consent {consent.version} · chosen {formatShortDate(consent.at)}
                </p>
              )}
            </div>
          )}
        </SettingsRow>

        <SettingsRow
          label="Send resume text to the AI provider"
          help={
            settings.ai.enabled ? (
              'Used to extract skills and explain fits. Off: Beacon’s own parser reads it, nothing leaves for AI.'
            ) : (
              <>
                AI is off, so nothing is sent.{' '}
                <Link
                  to="/settings/ai"
                  className="rounded-xs font-medium text-accent-strong underline-offset-3 hover:underline focus-visible:focus-ring"
                >
                  AI & keys
                </Link>
              </>
            )
          }
        >
          {({ labelId, helpId }) => (
            <Switch
              checked={settings.privacy.sendResumeToAi && settings.ai.enabled}
              disabled={!settings.ai.enabled}
              onCheckedChange={(on) => patch({ privacy: { sendResumeToAi: on }, ai: { consent: on } })}
              aria-labelledby={labelId}
              aria-describedby={helpId}
              data-testid="settings-privacy-resume-ai"
            />
          )}
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Your data" description="Stored in MongoDB Atlas (Mumbai). Files are encrypted at rest." data-testid="settings-data">
        <SettingsRow label="Export" help="Everything Beacon holds about you, as one JSON file.">
          {() => <ExportData />}
        </SettingsRow>
        <SettingsRow label="Delete account" help="Removes your profile, resume, tracker, alert rules and settings.">
          {() => <DeleteAccount />}
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
