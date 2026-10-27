import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { useUpdateMe } from '@/api/me';
import { useUpdateSettings } from '@/api/settings';
import type { AiMode } from '@/api/types';
import { BeaconMark } from '@/components/brand/BeaconMark';
import { useSignOut } from '@/components/shell/use-sign-out';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

import { CONSENT_VERSION, settingsForAiMode } from './consent';

const OPTIONS: { value: AiMode; title: string; body: string; note?: string }[] = [
  {
    value: 'beacon',
    title: "Use Beacon's AI.",
    body: "Your resume text and the listings you open are sent to Meta's Model API to extract skills, explain fits and suggest tailoring tips.",
    note: "Meta's free contributor tier may use prompts to improve its models.",
  },
  {
    value: 'byok',
    title: 'Use my own API key.',
    body: "Any OpenAI-compatible provider. You'll add the key in Settings. Until then, Beacon runs without AI.",
  },
  {
    value: 'off',
    title: "Don't use AI.",
    body: 'Matching uses embeddings and rules only, so everything except tailoring tips still works.',
  },
];

/** One honest consent screen before onboarding (USERFLOW §1.2). Nothing is pre-selected. */
export function Component() {
  const [mode, setMode] = useState<AiMode | null>(null);
  const [agreed, setAgreed] = useState(false);
  const updateMe = useUpdateMe();
  const updateSettings = useUpdateSettings();
  const navigate = useNavigate();
  const signOut = useSignOut();
  const canContinue = mode !== null && (mode !== 'beacon' || agreed);
  const pending = updateMe.isPending || updateSettings.isPending;

  const submit = async () => {
    if (!mode || !canContinue) return;
    const resumeToAi = mode === 'beacon' && agreed;
    try {
      await updateMe.mutateAsync({
        consent: { version: CONSENT_VERSION, aiMode: mode, resumeToAi },
        onboardingStep: 'resume',
      });
      await updateSettings.mutateAsync(settingsForAiMode(mode, resumeToAi));
      void navigate('/onboarding/resume', { replace: true });
    } catch (error) {
      toast.error(`Couldn't save your choice. ${errorMessage(error)}`, { duration: 8000 });
    }
  };

  return (
    <div data-testid="consent-page" className="min-h-dvh bg-bg">
      <header className="flex h-14 items-center px-gutter pt-safe">
        <BeaconMark className="size-6 text-fg" />
      </header>
      <main id="main" className="mx-auto flex max-w-prose flex-col gap-8 px-gutter pt-6 pb-16">
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-display text-fg">Before we start</h1>
          <p className="text-body-lg text-fg-secondary">
            Beacon reads your resume and preferences to rank opportunities for you. Here is exactly what happens to them.
          </p>
        </div>
        <ul className="flex flex-col gap-3 text-body-lg text-fg-secondary">
          <li>
            <strong className="font-medium text-fg">What we store:</strong> your Google name, email and photo, your resume file
            and the profile we parse from it, your preferences, saved listings and tracker. It is stored in MongoDB Atlas (Mumbai
            region), and files are encrypted at rest.
          </li>
          <li>
            <strong className="font-medium text-fg">What we never do:</strong> sell your data, show ads, or share your profile
            with companies.
          </li>
          <li>
            <strong className="font-medium text-fg">You stay in control:</strong> export everything as JSON or delete your
            account at any time from Settings.
          </li>
        </ul>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-h2 text-fg">How should Beacon use AI?</legend>
            <p className="-mt-1 mb-1 text-small text-fg-tertiary">You can change this later in Settings.</p>
            <RadioGroup value={mode ?? ''} onValueChange={(v) => setMode(v as AiMode)} aria-label="AI choice">
              {OPTIONS.map((option) => (
                <div
                  key={option.value}
                  className={cn(
                    'flex flex-col gap-3 rounded-md border bg-surface-raised p-4 transition-colors duration-fast',
                    mode === option.value ? 'border-accent-strong' : 'border-border',
                  )}
                >
                  <div className="flex gap-3">
                    <RadioGroupItem value={option.value} id={`ai-${option.value}`} className="mt-1" />
                    <Label htmlFor={`ai-${option.value}`} className="flex flex-col items-start gap-1 font-normal">
                      <span className="text-body font-medium text-fg">{option.title}</span>
                      <span className="text-body text-fg-secondary">{option.body}</span>
                      {option.note && <em className="text-small text-fg-tertiary">{option.note}</em>}
                    </Label>
                  </div>
                  {option.value === 'beacon' && mode === 'beacon' && (
                    <div className="ml-7 flex items-start gap-2.5">
                      <Checkbox
                        id="consent-resume-to-ai"
                        checked={agreed}
                        onCheckedChange={(v) => setAgreed(v === true)}
                        className="mt-0.5"
                      />
                      <Label htmlFor="consent-resume-to-ai" className="font-normal text-fg-secondary">
                        I agree that my resume text is sent to Meta for this. (Required for this option.)
                      </Label>
                    </div>
                  )}
                </div>
              ))}
            </RadioGroup>
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" size="lg" disabled={!canContinue || pending} data-testid="consent-continue">
              {pending ? 'Saving…' : 'Continue'}
            </Button>
            <Button type="button" variant="ghost" size="lg" onClick={signOut}>
              Sign out
            </Button>
            <span className="ml-auto flex gap-3 text-small">
              <a className="text-accent-strong underline-offset-3 hover:underline" href="/privacy">
                Privacy
              </a>
              <a className="text-accent-strong underline-offset-3 hover:underline" href="/terms">
                Terms
              </a>
            </span>
          </div>
        </form>
      </main>
    </div>
  );
}
