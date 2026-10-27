import { zodResolver } from '@hookform/resolvers/zod';
import { SlidersHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';

import { ResponsiveDrawer } from '@/components/responsive-drawer';
import { Button } from '@/components/ui/button';
import { PreferencesFields } from '@/features/onboarding/components/PreferencesFields';
import {
  defaultPreferences,
  formatStipendFloor,
  preferencesFormSchema,
  preferencesPatch,
  REMOTE_CHOICES,
  remoteChoiceOf,
  TYPE_CHOICES,
  WORK_AUTH_COUNTRIES,
  type PreferencesFormInput,
  type PreferencesFormValues,
} from '@/features/onboarding/lib/preferences';
import type { ProfileDraft } from '@/features/profile/lib/profile-model';
import type { ProfileUpdate } from '@/features/profile/lib/use-profile-editor';
import { getRoleFamily } from '@kestrel/shared';

const COUNTRY = new Map(WORK_AUTH_COUNTRIES.map((c) => [c.code, c.name]));

function Chips({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <span className="text-small text-fg-tertiary">{empty}</span>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((label) => (
        <li key={label} className="inline-flex h-6 items-center rounded-xs bg-surface-sunken px-2 text-caption text-fg-secondary">
          {label}
        </li>
      ))}
    </ul>
  );
}

/** Read-only summary of what reaches the radar, with [Edit preferences] (the same questions as onboarding). */
export function PreferencesSummary({ draft, onEdit }: { draft: ProfileDraft; onEdit: () => void }) {
  const types = TYPE_CHOICES.filter((c) => c.types.some((t) => draft.opportunityTypes.includes(t))).map((c) => c.label);
  const remote = REMOTE_CHOICES.find((c) => c.value === remoteChoiceOf(draft.remotePref))?.label ?? 'Any';
  const floor = draft.stipendFloor;
  const rows: [string, ReactNode][] = [
    ['Looking for', <Chips key="t" items={types} empty="All types" />],
    ['Roles', <Chips key="r" items={draft.preferredRoles.map((r) => getRoleFamily(r)?.label ?? r)} empty="Any role" />],
    [
      'Where',
      <span key="w" className="text-body text-fg">
        {remote}
        {draft.preferredLocations.length > 0 && <span className="text-fg-secondary"> · {draft.preferredLocations.join(', ')}</span>}
        {draft.openToRelocate && <span className="text-fg-tertiary"> · open to relocating</span>}
      </span>,
    ],
    [
      'Stipend floor',
      <span key="s" className="font-mono text-mono text-fg">
        {floor && floor.period === 'month' && (floor.currency === 'INR' || floor.currency === 'USD')
          ? formatStipendFloor(floor.amount, floor.currency)
          : floor
            ? `${floor.amount} ${floor.currency}/${floor.period}`
            : 'No minimum'}
      </span>,
    ],
    ['No sponsorship needed', <Chips key="a" items={draft.workAuth.authorisedCountries.map((c) => COUNTRY.get(c) ?? c)} empty="Not set" />],
    ['Languages', <Chips key="l" items={draft.languages.map((l) => l.name)} empty="Not set" />],
  ];
  return (
    <div className="flex flex-col gap-3" data-testid="profile-preferences">
      <dl className="grid gap-x-4 gap-y-2.5 sm:grid-cols-[9rem_minmax(0,1fr)]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-small text-fg-tertiary sm:pt-0.5">{label}</dt>
            <dd className="min-w-0">{value}</dd>
          </div>
        ))}
      </dl>
      <Button variant="secondary" size="sm" onClick={onEdit} className="self-start" data-testid="profile-preferences-edit">
        <SlidersHorizontal className="size-4" strokeWidth={1.5} aria-hidden="true" />
        Edit preferences
      </Button>
    </div>
  );
}

function PreferencesForm({ draft, onSave }: { draft: ProfileDraft; onSave: (values: PreferencesFormValues) => void }) {
  const form = useForm<PreferencesFormInput, unknown, PreferencesFormValues>({
    resolver: zodResolver(preferencesFormSchema),
    defaultValues: defaultPreferences(draft),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });
  return (
    <form
      id="profile-preferences-form"
      noValidate
      onSubmit={(e) => void form.handleSubmit(onSave)(e)}
      className="flex flex-col gap-6 p-4"
    >
      <PreferencesFields form={form} testPrefix="profile" />
    </form>
  );
}

/** The preferences editor in the responsive drawer (push panel at xl, sheet, bottom sheet on phones). */
export function PreferencesPanel({
  draft,
  open,
  onOpenChange,
  commit,
  session,
}: {
  draft: ProfileDraft;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commit: (update: ProfileUpdate, message?: string | null) => void;
  /** Bumped by the caller on every opening: a fresh form that starts from the saved values. */
  session: number;
}) {
  return (
    <ResponsiveDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Preferences"
      description="What reaches your radar. Hard limits are always shown on the listing."
      handleLabel="Close preferences"
      data-testid="profile-preferences-panel"
      actions={
        <Button type="submit" form="profile-preferences-form" variant="primary" size="sm" data-testid="profile-preferences-save">
          Save
        </Button>
      }
    >
      <PreferencesForm
        key={session}
        draft={draft}
        onSave={(values) => {
          commit((d) => ({ ...d, ...preferencesPatch(values, d) }), 'Preferences saved.');
          onOpenChange(false);
        }}
      />
    </ResponsiveDrawer>
  );
}
