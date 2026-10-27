import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { usePacks, useTogglePack } from '@/api';
import {
  deleteSourceRequest,
  removeSourceFromCache,
  restoreSourcesCache,
  useCommunitySources,
} from '@/api/sources';
import { Button } from '@/components/ui/button';
import { OptionCards } from '@/features/onboarding/components/OptionCards';
import { Question } from '@/features/onboarding/components/Question';
import {
  SourceUrlDetector,
  type AddedSource,
} from '@/features/onboarding/components/SourceUrlDetector';
import { useOnboarding } from '@/features/onboarding/flow/context';
import {
  canonicalPackId,
  PACK_BLURBS,
  preselectedPacks,
  sortPacks,
} from '@/features/onboarding/lib/packs';
import { CompanyLogo, Skeleton } from '@kestrel/ui';

type Logo = { name: string; domain: string | null };

function LogoStack({ logos }: { logos: readonly Logo[] }) {
  if (logos.length === 0) return null;
  return (
    <span className="flex -space-x-1.5" aria-hidden="true">
      {logos.map((l, i) => (
        <CompanyLogo
          key={`${l.name}-${i}`}
          name={l.name}
          domain={l.domain}
          size={20}
          className="ring-2 ring-surface-raised"
          style={{ zIndex: logos.length - i }}
        />
      ))}
    </span>
  );
}

/** Step 14: curated source packs (preselected from the answers, 1–7 toggle) + any careers page. */
export function PacksStep() {
  const qc = useQueryClient();
  const flow = useOnboarding();
  const packs = usePacks();
  const community = useCommunitySources();
  const toggle = useTogglePack();
  const [choice, setChoice] = useState<string[] | null>(null);
  const [added, setAdded] = useState<AddedSource[]>([]);
  const ordered = useMemo(() => sortPacks(packs.data ?? []), [packs.data]);

  const defaults = useMemo(() => {
    if (!packs.data) return null;
    const enabled = packs.data.filter((p) => p.enabled).map((p) => p.id);
    if (enabled.length > 0) return enabled;
    const rules = preselectedPacks(flow.draft.opportunityTypes, flow.draft.remotePref);
    const interests = flow.answers.interests ?? [];
    if (interests.includes('opensource') || interests.includes('research'))
      rules.add('opensource-programs');
    if (interests.includes('hackathons') || interests.includes('cp')) rules.add('hackathons-india');
    for (const id of (flow.answers.companyPacks as string[] | undefined) ?? []) rules.add(id);
    if (rules.size === 0) rules.add('top-indian-product');
    return packs.data.filter((p) => rules.has(canonicalPackId(p.id))).map((p) => p.id);
  }, [
    flow.answers.companyPacks,
    flow.answers.interests,
    flow.draft.opportunityTypes,
    flow.draft.remotePref,
    packs.data,
  ]);
  const selected = choice ?? defaults ?? [];

  const logos = useMemo(() => {
    const map = new Map<string, { logos: Logo[]; listings: number }>();
    for (const s of community.data ?? []) {
      if (!s.packId) continue;
      const id = canonicalPackId(s.packId);
      const entry = map.get(id) ?? { logos: [], listings: 0 };
      entry.listings += s.listingsFound ?? 0;
      if (entry.logos.length < 4 && s.companyDomain)
        entry.logos.push({ name: s.name, domain: s.companyDomain });
      map.set(id, entry);
    }
    return map;
  }, [community.data]);

  const sources = ordered
    .filter((p) => selected.includes(p.id))
    .reduce((n, p) => n + p.sourceCount, 0);
  const nothing = selected.length === 0 && added.length === 0;

  function save() {
    for (const p of ordered) {
      const on = selected.includes(p.id);
      if (on !== p.enabled)
        void flow.track(toggle.mutateAsync({ id: p.id, enabled: on })).catch(() => undefined);
    }
    flow.complete('packs', { answers: { packs: selected, ownSources: added.length } });
  }

  return (
    <Question
      step="packs"
      prompt="Where should Beacon look?"
      helper="Packs are watched for everyone, so they’re free and already full."
      width="lg"
      primary={{
        label:
          selected.length > 0 ? `Watch ${sources.toLocaleString('en-IN')} sources` : 'Continue',
        disabled: nothing || !packs.data,
        hint: 'Turn on a pack or add a careers page.',
        onClick: save,
      }}
      skip={{
        label: 'Skip — choose later in Sources',
        onSkip: () => flow.complete('packs', { how: 'skipped' }),
      }}
    >
      {packs.isError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3"
          data-testid="onboarding-packs-error"
        >
          <p className="text-body text-fg-secondary">Couldn’t load the source packs.</p>
          <Button variant="secondary" onClick={() => void packs.refetch()}>
            Try again
          </Button>
        </div>
      ) : !packs.data ? (
        <div
          className="grid gap-2.5 sm:grid-cols-2"
          role="status"
          aria-label="Loading source packs"
          data-testid="onboarding-packs-loading"
        >
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[4.5rem] rounded-xl" />
          ))}
        </div>
      ) : (
        <OptionCards
          aria-label="Source packs"
          multiple
          hotkeys
          options={ordered.map((p) => {
            const id = canonicalPackId(p.id);
            const stats = logos.get(id);
            return {
              value: p.id,
              label: p.name,
              hint: `${PACK_BLURBS[id] ?? (p.optional ? 'Optional pack' : 'Curated pack')} · ${p.sourceCount} sources`,
              media: stats ? <LogoStack logos={stats.logos} /> : undefined,
              data: { 'data-pack-id': p.id },
            };
          })}
          value={selected}
          onChange={setChoice}
          testId="onboarding-pack-row"
        />
      )}
      <div className="flex flex-col gap-2 border-t border-border-subtle pt-5">
        <p className="text-body font-medium text-fg">Missing a company?</p>
        <SourceUrlDetector
          added={added}
          onAdded={(s) => setAdded((list) => [s, ...list.filter((x) => x.id !== s.id)])}
          onRemove={(s) => {
            setAdded((list) => list.filter((x) => x.id !== s.id));
            const previous = removeSourceFromCache(qc, s.id);
            void deleteSourceRequest(qc, s.id).catch(() => {
              restoreSourcesCache(qc, previous);
              setAdded((list) => [s, ...list]);
            });
          }}
        />
      </div>
    </Question>
  );
}
