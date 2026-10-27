import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { useProfile, useUpdateMe, useUpdateProfile } from '@/api';
import type { FeedResponse } from '@/api/types';
import { Button } from '@/components/ui/button';
import { PreferencesFields } from '@/features/onboarding/components/PreferencesFields';
import { StepIntro } from '@/features/onboarding/components/StepIntro';
import {
  defaultPreferences,
  matchCountQuery,
  preferencesFormSchema,
  preferencesPatch,
  type PreferencesFormInput,
  type PreferencesFormValues,
} from '@/features/onboarding/lib/preferences';
import { useStepActions } from '@/features/onboarding/lib/step-actions';
import { toDraft, type ProfileDraft } from '@/features/profile/lib/profile-model';
import { api } from '@/lib/api';
import { Skeleton } from '@kestrel/ui';

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** "≈ 1,240 open listings match so far" (shared index, debounced 300 ms; USERFLOW §1.5). */
function useMatchCount(values: PreferencesFormInput): string | null {
  const key = useDebounced(JSON.stringify(matchCountQuery(values)), 300);
  const query = useQuery({
    queryKey: ['onboarding', 'match-count', key],
    queryFn: ({ signal }) =>
      api.get<FeedResponse>('/v1/feed', { signal, query: JSON.parse(key) as Record<string, string> }),
    staleTime: 60_000,
    retry: false,
    meta: { persist: false },
    placeholderData: (previous) => previous,
  });
  const total = query.data?.total;
  if (typeof total !== 'number') return null;
  return `≈ ${total.toLocaleString('en-IN')} open ${total === 1 ? 'listing matches' : 'listings match'} so far`;
}

/** Focus the first invalid control, in visual order (DESIGN §9 forms). */
function focusFirstError(errors: Partial<Record<keyof PreferencesFormValues, unknown>>) {
  const order: (keyof PreferencesFormValues)[] = ['opportunityTypes', 'preferredRoles', 'gradYear'];
  const first = order.find((k) => errors[k]);
  const selector =
    first === 'opportunityTypes'
      ? '[data-testid="onboarding-type-card"]'
      : first === 'gradYear'
        ? '[data-testid="onboarding-pref-gradyear"]'
        : '[data-testid="onboarding-role-input"]';
  document.querySelector<HTMLElement>(selector)?.focus();
}

function PreferencesForm({ draft, onDone }: { draft: ProfileDraft; onDone: () => void }) {
  const updateProfile = useUpdateProfile();
  const updateMe = useUpdateMe();
  const [saveError, setSaveError] = useState(false);
  const defaults = useMemo(() => defaultPreferences(draft), [draft]);
  const form = useForm<PreferencesFormInput, unknown, PreferencesFormValues>({
    resolver: zodResolver(preferencesFormSchema),
    defaultValues: defaults,
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    shouldFocusError: false,
  });
  const values = useWatch({ control: form.control }) as PreferencesFormInput;
  const meta = useMatchCount(values);

  async function save(patch: Parameters<typeof updateProfile.mutateAsync>[0]) {
    setSaveError(false);
    try {
      await updateProfile.mutateAsync(patch);
      await updateMe.mutateAsync({ onboardingStep: 'sources' });
      onDone();
    } catch {
      setSaveError(true);
    }
  }

  useStepActions('preferences', {
    onContinue: () =>
      form.handleSubmit(
        (valid) => save(preferencesPatch(valid, draft)),
        (errors) => focusFirstError(errors),
      )(),
    pending: updateProfile.isPending || updateMe.isPending,
    meta,
    onSkip: async () => {
      // "Skip for now keeps the defaults shown" (USERFLOW §1.5): save whatever is valid.
      const parsed = preferencesFormSchema.safeParse(form.getValues());
      if (parsed.success) await save(preferencesPatch(parsed.data, draft));
      else {
        await save({ opportunityTypes: form.getValues('opportunityTypes') });
      }
    },
  });

  return (
    <form
      noValidate
      onSubmit={(e) => e.preventDefault()}
      data-testid="onboarding-preferences-form"
      className="flex flex-col gap-6"
    >
      <PreferencesFields form={form} />
      {saveError && (
        <p role="alert" className="flex items-center gap-1.5 text-small text-danger">
          <AlertCircle className="size-4" strokeWidth={1.5} aria-hidden="true" />
          Couldn’t save your preferences. Check your connection and press Continue again.
        </p>
      )}
      {meta && <p className="text-small text-fg-tertiary sm:hidden">{meta}</p>}
    </form>
  );
}

/** Keeps [Continue] disabled while the profile loads (the form registers the real actions). */
function WaitingActions() {
  useStepActions('preferences', { onContinue: () => undefined, disabled: true });
  return null;
}

/** Step 2 — Preferences: what reaches the radar. Prefilled from the resume; nothing is permanent. */
export function PreferencesStep({ onDone }: { onDone: () => void }) {
  const profile = useProfile();
  const draft = useMemo(() => (profile.data ? toDraft(profile.data.profile) : null), [profile.data]);

  return (
    <div className="grid gap-8 pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:gap-12 lg:pt-10">
      <div className="flex min-w-0 max-w-3xl flex-col gap-8">
        <StepIntro title="What are you looking for?" why="These decide what reaches your radar. Nothing here is permanent." />
        {draft ? (
          <PreferencesForm draft={draft} onDone={onDone} />
        ) : profile.isError ? (
          <div role="alert" className="flex flex-col items-start gap-3" data-testid="onboarding-preferences-error">
            <WaitingActions />
            <p className="text-body text-fg-secondary">Couldn’t load your profile.</p>
            <Button variant="secondary" onClick={() => void profile.refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3" data-testid="onboarding-preferences-loading" aria-busy="true">
            <WaitingActions />
            <Skeleton className="h-4 w-40" />
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-16 rounded-md" />
              ))}
            </div>
          </div>
        )}
      </div>
      <aside className="hidden lg:block" aria-label="How these are used">
        <div className="sticky top-6 flex flex-col gap-3 rounded-lg border border-border bg-surface p-5 text-small text-fg-secondary">
          <h2 className="text-h3 text-fg">How Beacon uses these</h2>
          <p>Types decide which kinds of listing are ranked for you.</p>
          <p>
            Hard limits are shown, never silent: if a listing excludes your graduation year its score is capped at 35,
            and “Remote only” caps on-site roles at 50. Each capped score says why.
          </p>
          <p>Roles, places and stipend nudge the score. Change any of it later in Profile.</p>
        </div>
      </aside>
    </div>
  );
}
