import {
  Briefcase,
  ChevronDown,
  FlaskConical,
  GitBranch,
  GraduationCap,
  Globe,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useId, useMemo, useState } from 'react';
import { Controller, type UseFormReturn } from 'react-hook-form';

import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { springs, tweens } from '@/features/onboarding/lib/motion';
import {
  EXPERIENCE_BANDS,
  formatStipendFloor,
  LANGUAGE_CHOICES,
  LOCATION_OPTIONS,
  REMOTE_CHOICES,
  STIPEND_CURRENCIES,
  TYPE_CHOICES,
  WORK_AUTH_COUNTRIES,
  type PreferencesFormInput,
  type PreferencesFormValues,
} from '@/features/onboarding/lib/preferences';
import { DEGREE_LEVEL_CHOICES, gradYearOptions } from '@/features/profile/lib/profile-model';
import { Field } from '@/features/settings/components/controls/Field';
import { SegmentedControl } from '@/features/settings/components/controls/SegmentedControl';
import { inputClass } from '@/features/settings/components/controls/styles';
import { ToggleCard } from '@/features/settings/components/controls/ToggleCard';
import { TokenChips, ToggleChip } from '@/features/settings/components/controls/TokenChips';
import { TokenCombobox, type ComboOption } from '@/features/settings/components/controls/TokenCombobox';
import { OPPORTUNITY_TYPES, ROLE_FAMILIES, type OpportunityType } from '@kestrel/shared';
import { cn } from '@kestrel/ui';

const TYPE_ICONS: Record<string, LucideIcon> = {
  internship: Briefcase,
  fulltime: Briefcase,
  hackathon: Trophy,
  scholarship: GraduationCap,
  research: FlaskConical,
  opensource: GitBranch,
};

const GROUP_LABELS: Record<string, string> = {
  engineering: 'Engineering',
  data: 'Data & ML',
  design: 'Design',
  product: 'Product',
  business: 'Business',
  research: 'Research',
  other: 'Other',
};

const ROLE_OPTIONS: ComboOption[] = ROLE_FAMILIES.map((r) => ({
  value: r.id,
  label: r.label,
  group: GROUP_LABELS[r.group] ?? 'Other',
}));
const ROLE_LABEL = new Map(ROLE_FAMILIES.map((r) => [r.id, r.label]));
const POPULAR_ROLES = ['backend', 'frontend', 'fullstack', 'data_analyst', 'ml_engineer', 'mobile', 'devops', 'product_designer']
  .map((id) => ROLE_OPTIONS.find((o) => o.value === id))
  .filter((o): o is ComboOption => Boolean(o));

const LOCATION_COMBO: ComboOption[] = LOCATION_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label,
  group: o.group,
  keywords: o.keywords,
}));
const LOCATION_SUGGESTED = LOCATION_COMBO.slice(0, 9);

export type PreferencesForm = UseFormReturn<PreferencesFormInput, unknown, PreferencesFormValues>;

export interface PreferencesFieldsProps {
  form: PreferencesForm;
  /** Prefix for testids (`onboarding` in the wizard, `profile` in the editor). */
  testPrefix?: string;
  className?: string;
}

/**
 * Step 2 questions, in USERFLOW §1.5 order: types → roles → where → graduation → stipend floor →
 * work authorisation, then "More" (languages, experience). Each says why it is asked.
 */
export function PreferencesFields({ form, testPrefix = 'onboarding', className }: PreferencesFieldsProps) {
  const { control, formState, watch } = form;
  const [moreOpen, setMoreOpen] = useState(false);
  const moreId = useId();
  const currency = watch('stipendCurrency');
  const years = useMemo(() => gradYearOptions(), []);

  return (
    <div className={cn('flex flex-col gap-8', className)}>
      <Controller
        control={control}
        name="opportunityTypes"
        render={({ field }) => {
          const selected = new Set<OpportunityType>(field.value);
          return (
            <Field
              label="Opportunity types"
              hint="Pick all that apply"
              error={formState.errors.opportunityTypes?.message}
              asGroup
              data-testid={`${testPrefix}-pref-types`}
            >
              {({ labelId, describedBy }) => (
                <div
                  role="group"
                  aria-labelledby={labelId}
                  aria-describedby={describedBy}
                  className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
                >
                  {TYPE_CHOICES.map((choice, i) => {
                    const on = choice.types.every((t) => selected.has(t));
                    return (
                      <ToggleCard
                        key={choice.id}
                        ref={i === 0 ? field.ref : undefined}
                        pressed={on}
                        icon={TYPE_ICONS[choice.id]}
                        title={choice.label}
                        description={choice.hint}
                        data-testid={`${testPrefix}-type-card`}
                        dataAttrs={{ 'data-type': choice.id }}
                        onPressedChange={(next) => {
                          const set = new Set(selected);
                          for (const t of choice.types) {
                            if (next) set.add(t);
                            else set.delete(t);
                          }
                          field.onChange(OPPORTUNITY_TYPES.filter((t) => set.has(t)));
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </Field>
          );
        }}
      />

      <Controller
        control={control}
        name="preferredRoles"
        render={({ field }) => (
          <Field
            label="Which kinds of work?"
            hint={`${field.value.length} of 5`}
            help="We suggest these from your skills. Roles close to these still rank, a little lower."
            error={formState.errors.preferredRoles?.message}
            asGroup
          >
            {({ labelId, describedBy }) => (
              <div className="flex flex-col gap-2">
                <TokenChips
                  aria-label="Chosen roles"
                  data-testid={`${testPrefix}-role-chips`}
                  items={field.value.map((id) => ({ value: id, label: ROLE_LABEL.get(id) ?? id }))}
                  onRemove={(id) => field.onChange(field.value.filter((v) => v !== id))}
                />
                <TokenCombobox
                  options={ROLE_OPTIONS}
                  emptyQueryOptions={POPULAR_ROLES}
                  selected={field.value}
                  disabled={field.value.length >= 5}
                  placeholder={field.value.length >= 5 ? 'Remove a role to add another' : 'Search roles, e.g. Backend'}
                  aria-labelledby={labelId}
                  aria-describedby={describedBy}
                  data-testid={`${testPrefix}-role-input`}
                  onSelect={(id) => {
                    if (field.value.length < 5 && !field.value.includes(id)) field.onChange([...field.value, id]);
                  }}
                />
              </div>
            )}
          </Field>
        )}
      />

      <div className="flex flex-col gap-4">
        <Controller
          control={control}
          name="remotePref"
          render={({ field }) => (
            <Field label="Where can you work?" asGroup help={REMOTE_CHOICES.find((c) => c.value === field.value)?.hint}>
              {({ labelId, describedBy }) => (
                <SegmentedControl
                  aria-labelledby={labelId}
                  aria-describedby={describedBy}
                  data-testid={`${testPrefix}-remote`}
                  value={field.value}
                  fill
                  className="sm:w-auto sm:max-w-md"
                  options={REMOTE_CHOICES.map((c) => ({
                    value: c.value,
                    label: c.label,
                    icon: c.value === 'remote_only' ? Globe : undefined,
                  }))}
                  onChange={field.onChange}
                />
              )}
            </Field>
          )}
        />
        <Controller
          control={control}
          name="preferredLocations"
          render={({ field }) => (
            <Field label="Cities" hint="Optional" asGroup error={formState.errors.preferredLocations?.message}>
              {({ labelId, describedBy }) => (
                <div className="flex flex-col gap-2">
                  <TokenChips
                    aria-label="Chosen places"
                    data-testid={`${testPrefix}-location-chips`}
                    items={field.value.map((v) => ({ value: v, label: v }))}
                    onRemove={(v) => field.onChange(field.value.filter((x) => x !== v))}
                  />
                  <TokenCombobox
                    options={LOCATION_COMBO}
                    emptyQueryOptions={LOCATION_SUGGESTED}
                    selected={field.value}
                    allowCustom
                    placeholder="Bengaluru, Pune, Remote…"
                    aria-labelledby={labelId}
                    aria-describedby={describedBy}
                    data-testid={`${testPrefix}-location-input`}
                    onSelect={(v) => !field.value.includes(v) && field.onChange([...field.value, v])}
                  />
                </div>
              )}
            </Field>
          )}
        />
        <Controller
          control={control}
          name="openToRelocate"
          render={({ field }) => (
            <label className="flex cursor-default items-center justify-between gap-4 rounded-md border border-border bg-surface-raised px-3 py-2.5">
              <span className="flex flex-col">
                <span className="text-body font-medium text-fg">Open to relocating</span>
                <span className="text-small text-fg-tertiary">On-site roles in other cities still rank, a little lower.</span>
              </span>
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
                data-testid={`${testPrefix}-relocate`}
                aria-label="Open to relocating"
              />
            </label>
          )}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <Controller
          control={control}
          name="gradYear"
          render={({ field }) => (
            <Field label="Graduation year" hint="Required" error={formState.errors.gradYear?.message}>
              {({ controlId, describedBy }) => (
                <select
                  id={controlId}
                  ref={field.ref}
                  data-testid={`${testPrefix}-pref-gradyear`}
                  aria-required="true"
                  aria-invalid={Boolean(formState.errors.gradYear) || undefined}
                  aria-describedby={describedBy}
                  value={field.value ?? ''}
                  onBlur={field.onBlur}
                  onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                  className={cn(inputClass, 'w-40 font-mono text-mono')}
                >
                  <option value="">Select year</option>
                  {(field.value && !years.includes(field.value) ? [field.value, ...years] : years).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
        />
        <Controller
          control={control}
          name="degreeLevel"
          render={({ field }) => (
            <Field label="Degree" asGroup>
              {({ labelId }) => (
                <SegmentedControl
                  aria-labelledby={labelId}
                  value={field.value}
                  data-testid={`${testPrefix}-degree`}
                  options={DEGREE_LEVEL_CHOICES.map((c) => ({ value: c.value, label: c.label }))}
                  onChange={field.onChange}
                />
              )}
            </Field>
          )}
        />
      </div>

      <Controller
        control={control}
        name="stipendAmount"
        render={({ field }) => {
          const c = STIPEND_CURRENCIES[currency];
          return (
            <Field
              label="Hide paid listings below…"
              hint="Optional"
              help="Hackathon prizes and scholarship awards are never hidden by this."
              asGroup
            >
              {({ labelId, describedBy }) => (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <output
                      aria-live="polite"
                      data-testid={`${testPrefix}-stipend-value`}
                      className={cn('min-w-32 font-mono text-mono', field.value > 0 ? 'text-fg' : 'text-fg-tertiary')}
                    >
                      {formatStipendFloor(field.value, currency)}
                    </output>
                    <Controller
                      control={control}
                      name="stipendCurrency"
                      render={({ field: cur }) => (
                        <SegmentedControl
                          size="sm"
                          aria-label="Currency"
                          value={cur.value}
                          options={[
                            { value: 'INR', label: '₹ INR' },
                            { value: 'USD', label: '$ USD' },
                          ]}
                          onChange={(next) => {
                            cur.onChange(next);
                            field.onChange(0);
                          }}
                        />
                      )}
                    />
                  </div>
                  <Slider
                    min={0}
                    max={c.max}
                    step={c.step}
                    value={[field.value]}
                    onValueChange={([v]) => field.onChange(v ?? 0)}
                    thumbLabels={['Minimum monthly stipend']}
                    aria-labelledby={labelId}
                    aria-describedby={describedBy}
                    rangeClassName="bg-accent-strong"
                    data-testid={`${testPrefix}-stipend`}
                    className="max-w-md"
                  />
                  <div className="flex max-w-md justify-between font-mono text-mono-sm text-fg-tertiary" aria-hidden="true">
                    <span>No minimum</span>
                    <span>
                      {c.symbol}
                      {new Intl.NumberFormat(c.locale).format(c.max)}/mo
                    </span>
                  </div>
                </div>
              )}
            </Field>
          );
        }}
      />

      <Controller
        control={control}
        name="authorisedCountries"
        render={({ field }) => (
          <Field label="Where can you work without sponsorship?" hint="Optional" asGroup>
            {({ labelId }) => (
              <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-1.5">
                {WORK_AUTH_COUNTRIES.map((country) => (
                  <ToggleChip
                    key={country.code}
                    label={country.name}
                    pressed={field.value.includes(country.code)}
                    data-testid={`${testPrefix}-country-chip`}
                    onPressedChange={(on) =>
                      field.onChange(on ? [...field.value, country.code] : field.value.filter((c) => c !== country.code))
                    }
                  />
                ))}
              </div>
            )}
          </Field>
        )}
      />

      <div className="flex flex-col gap-4 border-t border-border-subtle pt-4">
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-controls={moreId}
          onClick={() => setMoreOpen((o) => !o)}
          className="-mx-2 flex items-center gap-2 self-start rounded-sm px-2 py-1 text-body font-medium text-fg-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-fg focus-visible:focus-ring"
          data-testid={`${testPrefix}-pref-more`}
        >
          <m.span animate={{ rotate: moreOpen ? 180 : 0 }} transition={springs.snappy} className="grid">
            <ChevronDown className="size-4" strokeWidth={1.5} aria-hidden="true" />
          </m.span>
          More: languages and experience
        </button>
        <AnimatePresence initial={false}>
          {moreOpen && (
            <m.div
              id={moreId}
              key="more"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: tweens.fadeIn }}
              exit={{ opacity: 0, transition: tweens.fadeOut }}
              className="flex flex-col gap-6"
            >
              <Controller
                control={control}
                name="languages"
                render={({ field }) => (
                  <Field label="Languages you work in" hint="Optional" asGroup>
                    {({ labelId }) => (
                      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-1.5">
                        {[...new Set([...LANGUAGE_CHOICES, ...field.value])].map((lang) => (
                          <ToggleChip
                            key={lang}
                            label={lang}
                            pressed={field.value.includes(lang)}
                            onPressedChange={(on) =>
                              field.onChange(on ? [...field.value, lang] : field.value.filter((l) => l !== lang))
                            }
                          />
                        ))}
                      </div>
                    )}
                  </Field>
                )}
              />
              <Controller
                control={control}
                name="experienceYears"
                render={({ field }) => (
                  <Field label="Work experience" hint="Optional" asGroup help="Internships count pro rata.">
                    {({ labelId, describedBy }) => (
                      <SegmentedControl
                        aria-labelledby={labelId}
                        aria-describedby={describedBy}
                        value={String(
                          EXPERIENCE_BANDS.reduce((best, b) => (field.value >= b.value ? b.value : best), 0),
                        )}
                        options={EXPERIENCE_BANDS.map((b) => ({ value: String(b.value), label: b.label }))}
                        onChange={(v) => field.onChange(Number(v))}
                      />
                    )}
                  </Field>
                )}
              />
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
