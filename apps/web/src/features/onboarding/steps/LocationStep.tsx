import { useId, useMemo, useState } from 'react';

import { Chip, OptionCards } from '@/features/onboarding/components/OptionCards';
import { Question } from '@/features/onboarding/components/Question';
import { SwitchRow } from '@/features/onboarding/components/SwitchRow';
import { useOnboarding } from '@/features/onboarding/flow/context';
import { listLine } from '@/features/onboarding/flow/copy';
import { CITY_CHIPS, REMOTE_CARDS } from '@/features/onboarding/flow/options';
import { LOCATION_OPTIONS, SPECIAL_LOCATIONS } from '@/features/onboarding/lib/preferences';
import { TokenCombobox } from '@/features/settings/components/controls/TokenCombobox';
import type { RemotePref } from '@kestrel/shared';

const QUICK = [...CITY_CHIPS.slice(0, 7), 'Anywhere in India', 'Outside India'];

/** "Where can you work?" Remote preference (1–3), places (metros first), relocation. */
export function LocationStep() {
  const flow = useOnboarding();
  const stored = flow.draft.remotePref;
  const [remote, setRemote] = useState<RemotePref>(
    stored === 'hybrid' ? 'prefer_remote' : stored === 'onsite' ? 'any' : stored,
  );
  const [places, setPlaces] = useState<string[]>(flow.draft.preferredLocations);
  const [relocate, setRelocate] = useState(flow.draft.openToRelocate);
  const citiesLabel = useId();
  const options = useMemo(
    () =>
      LOCATION_OPTIONS.map((o) => ({
        value: o.value,
        label: o.label,
        group: o.group,
        keywords: o.keywords,
      })),
    [],
  );
  const extra = places.filter((p) => !QUICK.includes(p));
  const cities = places.filter((p) => !(SPECIAL_LOCATIONS as readonly string[]).includes(p));
  const reflection =
    remote === 'remote_only'
      ? 'We’ll lead with remote roles.'
      : cities.length > 0
        ? `We’ll look in ${listLine(cities)}${remote === 'prefer_remote' ? ', and remote' : ''}.`
        : null;
  const profile = { remotePref: remote, preferredLocations: places, openToRelocate: relocate };

  return (
    <Question
      step="location"
      prompt="Where can you work?"
      helper="How you like to work, then any places. Press 1–3 for the first part."
      width="lg"
      liveDraft={{ ...flow.draft, ...profile }}
      primary={{ onClick: () => flow.complete('location', { profile }) }}
      skip={{
        label: 'Skip — every location counts the same',
        onSkip: () => flow.complete('location', { how: 'skipped' }),
      }}
      footnote={reflection ? <span aria-live="polite">{reflection}</span> : null}
    >
      <OptionCards
        aria-label="How you like to work"
        hotkeys
        columns={3}
        size="sm"
        options={REMOTE_CARDS.map((c) => ({
          value: c.value,
          label: c.label,
          hint: c.hint,
          icon: c.icon,
          tone: c.tone,
        }))}
        value={[remote]}
        onChange={([v]) => v && setRemote(v as RemotePref)}
        testId="onboarding-remote"
      />
      <div className="flex flex-col gap-2 border-t border-border-subtle pt-5">
        <p id={citiesLabel} className="text-body font-medium text-fg">
          Places <span className="font-normal text-fg-tertiary">(optional)</span>
        </p>
        <div role="group" aria-labelledby={citiesLabel} className="flex flex-wrap gap-2">
          {[...QUICK, ...extra].map((city) => (
            <Chip
              key={city}
              pressed={places.includes(city)}
              onPressedChange={(on) =>
                setPlaces((p) => (on ? [...p, city] : p.filter((x) => x !== city)))
              }
              testId="onboarding-city"
              data={{ 'data-city': city }}
            >
              {city}
            </Chip>
          ))}
        </div>
        <TokenCombobox
          options={options}
          selected={places}
          allowCustom
          placeholder="Another city or country"
          aria-label="Add a place"
          limit={8}
          onSelect={(value) =>
            setPlaces((p) => (p.includes(value) ? p : [...p, value].slice(0, 20)))
          }
          data-testid="onboarding-city-input"
        />
      </div>
      <SwitchRow
        checked={relocate}
        onCheckedChange={setRelocate}
        label="Open to relocating"
        description="On-site roles in other cities still rank well."
        testId="onboarding-relocate"
      />
    </Question>
  );
}
