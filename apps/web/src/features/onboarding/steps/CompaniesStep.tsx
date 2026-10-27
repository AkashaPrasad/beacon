import { Plus } from 'lucide-react';
import { useId, useMemo, useState } from 'react';

import { usePacks } from '@/api';
import { useCommunitySources } from '@/api/sources';
import { Chip } from '@/features/onboarding/components/OptionCards';
import { Question } from '@/features/onboarding/components/Question';
import { useOnboarding } from '@/features/onboarding/flow/context';
import { listLine } from '@/features/onboarding/flow/copy';
import { POPULAR_COMPANIES } from '@/features/onboarding/flow/options';
import { canonicalPackId } from '@/features/onboarding/lib/packs';
import { saveView } from '@/features/radar/lib/savedViews';
import { TokenCombobox } from '@/features/settings/components/controls/TokenCombobox';
import { CompanyLogo } from '@kestrel/ui';

type Company = { name: string; domain: string | null };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** "Any dream companies?" Picks preselect the packs that watch them and become a Radar saved view. */
export function CompaniesStep() {
  const flow = useOnboarding();
  const community = useCommunitySources();
  const packs = usePacks();
  const [picked, setPicked] = useState<Company[]>(flow.answers.targetCompanies ?? []);
  const label = useId();
  const has = (name: string) => picked.some((c) => norm(c.name) === norm(name));
  const custom = picked.filter((c) => !POPULAR_COMPANIES.some((p) => p.name === c.name));

  /** Company → pack that already watches it (community sources carry `packId`). */
  const watched = useMemo(() => {
    const names = new Map((packs.data ?? []).map((p) => [canonicalPackId(p.id), p.name]));
    const map = new Map<
      string,
      { pack: string | null; packId: string | null; domain: string | null }
    >();
    for (const s of community.data ?? []) {
      const key = norm(s.name.replace(/\s+(careers|jobs)$/i, ''));
      if (!map.has(key)) {
        const packId = s.packId ? canonicalPackId(s.packId) : null;
        map.set(key, {
          pack: packId ? (names.get(packId) ?? null) : null,
          packId,
          domain: s.companyDomain,
        });
      }
    }
    return map;
  }, [community.data, packs.data]);

  const searchOptions = useMemo(
    () =>
      [
        ...new Set((community.data ?? []).map((s) => s.name.replace(/\s+(careers|jobs)$/i, ''))),
      ].map((name) => ({
        value: name,
        label: name,
        hint: watched.get(norm(name))?.pack ?? undefined,
      })),
    [community.data, watched],
  );

  const status = picked.map((c) => ({ ...c, info: watched.get(norm(c.name)) ?? null }));
  const inPacks = [...new Set(status.flatMap((c) => (c.info?.packId ? [c.info.packId] : [])))];
  const unwatched = status.filter((c) => !c.info).map((c) => c.name);

  function save() {
    if (picked.length > 0) {
      const search = new URLSearchParams({
        company: picked.map((c) => c.name).join(','),
      }).toString();
      saveView('Dream companies', search);
    }
    flow.complete('companies', { answers: { targetCompanies: picked, companyPacks: inPacks } });
  }

  return (
    <Question
      step="companies"
      prompt="Any dream companies?"
      helper="We’ll make sure they’re watched."
      width="lg"
      liveDraft={flow.draft}
      primary={{
        label: picked.length > 0 ? `Continue with ${picked.length}` : 'Continue',
        onClick: save,
      }}
      skip={{
        label: 'Skip',
        onSkip: () =>
          flow.complete('companies', { how: 'skipped', answers: { targetCompanies: [] } }),
      }}
      footnote={
        picked.length > 0 ? (
          <span aria-live="polite" data-testid="onboarding-companies-status">
            {inPacks.length > 0 &&
              `${listLine(status.filter((c) => c.info).map((c) => c.name))} ${status.filter((c) => c.info).length === 1 ? 'is' : 'are'} already watched in your packs. `}
            {unwatched.length > 0 && `We’ll add careers pages for ${listLine(unwatched)}.`}
          </span>
        ) : null
      }
    >
      <p id={label} className="sr-only">
        Companies
      </p>
      <div role="group" aria-labelledby={label} className="flex flex-wrap gap-2">
        {[...POPULAR_COMPANIES, ...custom].map((c) => {
          const info = watched.get(norm(c.name));
          return (
            <Chip
              key={c.name}
              pressed={has(c.name)}
              onPressedChange={(on) =>
                setPicked((p) =>
                  on
                    ? [...p, { name: c.name, domain: c.domain }]
                    : p.filter((x) => norm(x.name) !== norm(c.name)),
                )
              }
              media={
                <CompanyLogo name={c.name} domain={c.domain ?? info?.domain ?? null} size={20} />
              }
              aria-label={`${c.name}${info?.pack ? `, watched in ${info.pack}` : ''}`}
              testId="onboarding-company"
              data={{ 'data-company': c.name }}
            >
              {c.name}
            </Chip>
          );
        })}
      </div>
      <div className="flex flex-col gap-1.5">
        <TokenCombobox
          options={searchOptions}
          selected={picked.map((c) => c.name)}
          allowCustom
          placeholder="Search companies Beacon watches, or add any"
          aria-label="Add a company"
          limit={8}
          onSelect={(name) => {
            if (has(name) || picked.length >= 20) return;
            setPicked((p) => [...p, { name, domain: watched.get(norm(name))?.domain ?? null }]);
          }}
          data-testid="onboarding-company-input"
        />
        <p className="flex items-center gap-1.5 text-caption text-fg-tertiary">
          <Plus className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          Not in the list? Type it and press Enter.
        </p>
      </div>
    </Question>
  );
}
