import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useMemo, useState } from 'react';

import { useProfile, useUpdateMe, useTogglePack, usePacks } from '@/api';
import { deleteSourceRequest, removeSourceFromCache, restoreSourcesCache, useCommunitySources } from '@/api/sources';
import type { PackDTO } from '@/api/types';
import { Button } from '@/components/ui/button';
import { SourceUrlDetector, type AddedSource } from '@/features/onboarding/components/SourceUrlDetector';
import { StepIntro } from '@/features/onboarding/components/StepIntro';
import { inlineReveal, rowVariants, stagger } from '@/features/onboarding/lib/motion';
import { canonicalPackId, PACK_BLURBS, preselectedPacks, sortPacks } from '@/features/onboarding/lib/packs';
import { useStepActions } from '@/features/onboarding/lib/step-actions';
import { toDraft } from '@/features/profile/lib/profile-model';
import { ToggleCard } from '@/features/settings/components/controls/ToggleCard';
import { CompanyLogo, Skeleton } from '@kestrel/ui';

interface PackStats {
  domains: { name: string; domain: string | null }[];
  listings: number;
  sources: number;
}

function LogoStack({ logos }: { logos: PackStats['domains'] }) {
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

/** Step 3 — Sources: curated packs (already being watched for everyone) plus any careers page. */
export function SourcesStep({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const packs = usePacks();
  const community = useCommunitySources();
  const profile = useProfile();
  const togglePack = useTogglePack();
  const updateMe = useUpdateMe();
  /** The user's choice; null until they toggle something (then it starts from the defaults). */
  const [choice, setChoice] = useState<Set<string> | null>(null);
  const [added, setAdded] = useState<AddedSource[]>([]);
  const [needsChoice, setNeedsChoice] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const ordered = useMemo(() => sortPacks(packs.data ?? []), [packs.data]);

  // Defaults: packs already on (resuming), else the USERFLOW §1.6 pre-selection rules.
  const defaults = useMemo(() => {
    if (!packs.data || !profile.data) return null;
    const enabled = packs.data.filter((p) => p.enabled).map((p) => p.id);
    if (enabled.length > 0) return new Set(enabled);
    const draft = toDraft(profile.data.profile);
    const rules = preselectedPacks(draft.opportunityTypes, draft.remotePref);
    return new Set(packs.data.filter((p) => rules.has(canonicalPackId(p.id))).map((p) => p.id));
  }, [packs.data, profile.data]);
  const selected = choice ?? defaults;

  const stats = useMemo(() => {
    const map = new Map<string, PackStats>();
    for (const s of community.data ?? []) {
      if (!s.packId) continue;
      const id = canonicalPackId(s.packId);
      const entry = map.get(id) ?? { domains: [], listings: 0, sources: 0 };
      entry.sources += 1;
      entry.listings += s.listingsFound ?? 0;
      if (entry.domains.length < 5 && s.companyDomain) entry.domains.push({ name: s.name, domain: s.companyDomain });
      map.set(id, entry);
    }
    return map;
  }, [community.data]);

  const chosen = selected ?? new Set<string>();
  const totalSources = ordered.filter((p) => chosen.has(p.id)).reduce((n, p) => n + p.sourceCount, 0);

  async function finish() {
    if (chosen.size === 0 && added.length === 0) {
      setNeedsChoice(true);
      return;
    }
    setSaveError(false);
    try {
      const changes = ordered.filter((p) => chosen.has(p.id) !== p.enabled);
      await Promise.all(changes.map((p) => togglePack.mutateAsync({ id: p.id, enabled: chosen.has(p.id) })));
      await updateMe.mutateAsync({ onboardingStep: 'done', onboardingCompleted: true });
      onDone();
    } catch {
      setSaveError(true);
    }
  }

  async function skip() {
    await updateMe.mutateAsync({ onboardingStep: 'done', onboardingCompleted: true }).catch(() => undefined);
    onDone();
  }

  useStepActions('sources', {
    onContinue: finish,
    continueLabel: 'Start my radar',
    pending: togglePack.isPending || updateMe.isPending,
    disabled: !selected,
    onSkip: skip,
    meta: chosen.size > 0 ? `${chosen.size} ${chosen.size === 1 ? 'pack' : 'packs'} · ${totalSources} sources` : null,
  });

  function toggle(pack: PackDTO, on: boolean) {
    setNeedsChoice(false);
    setChoice((prev) => {
      const next = new Set(prev ?? defaults ?? []);
      if (on) next.add(pack.id);
      else next.delete(pack.id);
      return next;
    });
  }

  return (
    <div className="grid gap-8 pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-12 lg:pt-10">
      <div className="flex min-w-0 flex-col gap-6">
        <StepIntro
          title="Where should Beacon look?"
          why="Packs are curated, shared lists that are already being watched. Add any careers page on top."
        />

        {packs.isError ? (
          <div role="alert" className="flex flex-col items-start gap-3" data-testid="onboarding-packs-error">
            <p className="text-body text-fg-secondary">Couldn’t load the source packs.</p>
            <Button variant="secondary" onClick={() => void packs.refetch()}>
              Retry
            </Button>
          </div>
        ) : !packs.data || !selected ? (
          <div className="flex flex-col gap-2" aria-busy="true" data-testid="onboarding-packs-loading">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-[4.5rem] rounded-md" />
            ))}
          </div>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Source packs" data-testid="onboarding-pack-list">
            {ordered.map((pack, i) => {
              const id = canonicalPackId(pack.id);
              const s = stats.get(id);
              const on = chosen.has(pack.id);
              const delay = stagger(i);
              return (
                <m.li
                  key={pack.id}
                  variants={rowVariants}
                  custom={i}
                  initial={delay === null ? false : 'hidden'}
                  animate="visible"
                >
                  <ToggleCard
                    variant="switch"
                    pressed={on}
                    onPressedChange={(next) => toggle(pack, next)}
                    data-testid="onboarding-pack-row"
                    dataAttrs={{ 'data-pack-id': pack.id }}
                    media={s && s.domains.length > 0 ? <LogoStack logos={s.domains} /> : undefined}
                    title={pack.name}
                    meta={`${pack.sourceCount} sources`}
                    description={
                      <>
                        {PACK_BLURBS[id] ?? (pack.optional ? 'Optional pack' : 'Curated pack')}
                        {s && s.listings > 0 && (
                          <span className="font-mono text-mono-sm"> · {s.listings.toLocaleString('en-IN')} listings</span>
                        )}
                      </>
                    }
                  />
                </m.li>
              );
            })}
          </ul>
        )}

        <AnimatePresence initial={false}>
          {needsChoice && (
            <m.p key="needs" {...inlineReveal} role="alert" className="flex items-start gap-1.5 text-small text-fg-secondary" data-testid="onboarding-sources-empty">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" strokeWidth={1.5} aria-hidden="true" />
              <span>
                Turn on at least one pack or add a URL, or{' '}
                <button
                  type="button"
                  onClick={() => void skip()}
                  className="rounded-xs font-medium text-accent-strong underline-offset-3 hover:underline focus-visible:focus-ring"
                >
                  skip
                </button>{' '}
                and choose later in Sources.
              </span>
            </m.p>
          )}
        </AnimatePresence>
        {saveError && (
          <p role="alert" className="flex items-center gap-1.5 text-small text-danger">
            <AlertCircle className="size-4" strokeWidth={1.5} aria-hidden="true" />
            Couldn’t start your radar. Check your connection and try again.
          </p>
        )}
        <p className="text-caption text-fg-tertiary">Packs are refreshed for everyone, so they don’t use your crawl budget.</p>
      </div>

      <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6 lg:self-start" aria-label="Your own sources">
        <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
          <SourceUrlDetector
            added={added}
            onAdded={(s) => {
              setNeedsChoice(false);
              setAdded((list) => [s, ...list.filter((x) => x.id !== s.id)]);
            }}
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
      </aside>
    </div>
  );
}
