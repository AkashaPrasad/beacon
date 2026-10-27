import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check } from 'lucide-react';
import { animate, AnimatePresence, m } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { queryKeys } from '@/api/keys';
import { useCompleteOnboarding } from '@/api/profile';
import type { FeedSummary, PackDTO } from '@/api/types';
import { BeaconMark } from '@/components/brand/BeaconMark';
import { Button } from '@/components/ui/button';
import { useAnnounce } from '@/features/onboarding/components/Chrome';
import { useOnboarding } from '@/features/onboarding/flow/context';
import { resetResumeUpload } from '@/features/onboarding/flow/resume-upload';
import { inlineReveal, rowVariants, springs, tweens } from '@/features/onboarding/lib/motion';
import { requestFirstRunTour } from '@/features/onboarding/tour/tour-store';
import { api } from '@/lib/api';
import { cn, usePrefersReducedMotion } from '@kestrel/ui';

type StageId = 'profile' | 'sources' | 'ranking';
type StageState = 'waiting' | 'active' | 'done' | 'slow';

const MAX_WARM_MS = 8_000;
const POLL_MS = 1_000;
const HOLD_MS = 600;

/** Resolves once no mutation with this key is in flight (paused offline ones resume first). */
async function waitIdle(
  qc: ReturnType<typeof useQueryClient>,
  mutationKey: readonly unknown[],
  maxMs = 15_000,
) {
  const until = Date.now() + maxMs;
  while (qc.isMutating({ mutationKey: [...mutationKey] }) > 0 && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 100));
  }
}

function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    if (reduced) {
      return undefined;
    }
    const controls = animate(0, value, {
      ...tweens.count,
      onUpdate: (v) => setShown(Math.round(v)),
    });
    return () => controls.stop();
  }, [reduced, value]);
  return <span className="tabular-nums">{(reduced ? value : shown).toLocaleString('en-IN')}</span>;
}

/** The mark inside a quiet ring that fills one third per finished stage (real progress, no loop). */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto grid size-24 place-items-center" aria-hidden="true">
      <svg viewBox="0 0 80 80" className="absolute inset-0 size-full -rotate-90">
        <circle cx="40" cy="40" r={r} className="fill-none stroke-border" strokeWidth="3" />
        <m.circle
          cx="40"
          cy="40"
          r={r}
          className="fill-none stroke-accent-strong"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - done / total) }}
          transition={springs.data}
        />
      </svg>
      <BeaconMark className="size-8 text-fg" />
    </div>
  );
}

/**
 * "Building your radar" (ONBOARDING §5). Every line is a real state, never a show: profile writes settle and
 * onboarding is marked complete (the API enqueues the profile embed + match) → pack toggles settle →
 * `/v1/feed/summary` polled every second until it stops warming up, at most 8 s. Ready: hold 600 ms on
 * "142 fits ready", then the Radar, where the tour is offered.
 */
export function CustomisingStep() {
  const flow = useOnboarding();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const announce = useAnnounce();
  const complete = useCompleteOnboarding();
  const [stages, setStages] = useState<Record<StageId, StageState>>({
    profile: 'active',
    sources: 'waiting',
    ranking: 'waiting',
  });
  const [detail, setDetail] = useState<Partial<Record<StageId, string>>>({});
  const [fits, setFits] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  const goToRadar = useCallback(() => {
    requestFirstRunTour(flow.me.user.id);
    resetResumeUpload();
    void navigate('/radar', { replace: true, viewTransition: true });
  }, [flow.me.user.id, navigate]);

  const run = useCallback(async () => {
    setFailed(false);
    const mark = (id: StageId, state: StageState, text?: string) => {
      setStages((s) => ({ ...s, [id]: state }));
      if (text) setDetail((x) => ({ ...x, [id]: text }));
    };
    try {
      mark('profile', 'active');
      announce('Saving your profile.');
      await waitIdle(qc, ['profile', 'patch']);
      await complete.mutateAsync();
      mark('profile', 'done');

      mark('sources', 'active');
      announce('Confirming your sources.');
      await waitIdle(qc, ['sources', 'pack']);
      await flow.settleWrites();
      const packs = (
        qc.getQueryData<{ items: PackDTO[] }>(queryKeys.sources.packs)?.items ?? []
      ).filter((p) => p.enabled);
      const sources = packs.reduce((n, p) => n + p.sourceCount, 0);
      mark(
        'sources',
        'done',
        packs.length > 0
          ? `${packs.length} ${packs.length === 1 ? 'pack' : 'packs'} · ${sources.toLocaleString('en-IN')} sources already indexed`
          : 'Add sources any time from Sources',
      );

      mark('ranking', 'active');
      announce('Ranking listings for you.');
      const until = Date.now() + MAX_WARM_MS;
      let summary: FeedSummary | null = null;
      while (Date.now() < until) {
        summary = await api.get<FeedSummary>('/v1/feed/summary').catch(() => null);
        if (summary && !summary.warmingUp) break;
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      if (summary) qc.setQueryData(queryKeys.feed.summary, summary);
      if (summary && !summary.warmingUp) {
        mark('ranking', 'done');
        setFits(summary.total);
        announce(`${summary.total} fits ready.`);
        await new Promise((r) => setTimeout(r, HOLD_MS));
        goToRadar();
      } else {
        mark('ranking', 'slow');
        announce('Taking a little longer. Your radar will keep filling in.');
      }
    } catch {
      setFailed(true);
      announce('Couldn’t finish setting up. Try again.');
    }
  }, [announce, complete, flow, goToRadar, qc]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);

  const rows: { id: StageId; label: string; done: string }[] = [
    { id: 'profile', label: 'Saving your profile', done: 'Profile saved' },
    { id: 'sources', label: 'Confirming your sources', done: 'Sources confirmed' },
    { id: 'ranking', label: 'Ranking listings for you…', done: 'Ranked' },
  ];
  const doneCount = Object.values(stages).filter((s) => s === 'done').length;
  const slow = stages.ranking === 'slow';

  return (
    <section
      className="mx-auto flex min-h-[calc(100dvh-3.75rem)] w-full max-w-[32rem] flex-col items-center justify-center gap-8 px-gutter py-12 text-center"
      aria-labelledby="customising-title"
      aria-busy={doneCount < 3 && !failed && !slow}
      data-testid="onboarding-customising"
    >
      <ProgressRing done={doneCount} total={3} />
      <h1
        id="customising-title"
        tabIndex={-1}
        className="font-serif text-display text-balance text-fg max-sm:text-[2rem] max-sm:leading-[1.1]"
      >
        {fits !== null
          ? 'Your radar is ready'
          : `Building your radar${flow.firstName ? `, ${flow.firstName}` : ''}`}
      </h1>
      <ol
        className="w-full rounded-xl border border-border bg-surface p-2 text-left shadow-e1"
        data-testid="onboarding-stages"
      >
        {rows.map((r, i) => {
          const state = stages[r.id];
          return (
            <m.li
              key={r.id}
              variants={rowVariants}
              custom={i}
              initial="hidden"
              animate="visible"
              className="flex items-center gap-3 rounded-lg px-3 py-3"
              data-testid="onboarding-stage"
              data-stage={r.id}
              data-state={state}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full border transition-colors duration-fast',
                  state === 'done'
                    ? 'border-accent-strong text-accent-strong'
                    : state === 'waiting'
                      ? 'border-border'
                      : 'border-fg-tertiary',
                )}
              >
                {state === 'done' ? (
                  <Check className="size-3.5" strokeWidth={2.5} />
                ) : state === 'active' ? (
                  <span className="size-1.5 rounded-full bg-fg-secondary motion-safe:animate-pulse" />
                ) : null}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span
                  className={cn('text-body', state === 'waiting' ? 'text-fg-tertiary' : 'text-fg')}
                >
                  {state === 'done' ? (
                    r.id === 'ranking' && fits !== null ? (
                      <>
                        <CountUp value={fits} /> fits ready
                      </>
                    ) : (
                      r.done
                    )
                  ) : (
                    r.label
                  )}
                </span>
                <AnimatePresence initial={false}>
                  {detail[r.id] && (
                    <m.span
                      key="d"
                      {...inlineReveal}
                      className="font-mono text-mono-sm text-fg-tertiary"
                    >
                      {detail[r.id]}
                    </m.span>
                  )}
                </AnimatePresence>
              </span>
              <span className="sr-only">
                {state === 'done' ? 'done' : state === 'waiting' ? 'waiting' : 'in progress'}
              </span>
            </m.li>
          );
        })}
      </ol>
      <AnimatePresence initial={false}>
        {slow && (
          <m.div
            key="slow"
            {...inlineReveal}
            className="flex flex-col items-center gap-3"
            data-testid="onboarding-customising-slow"
          >
            <p className="text-body text-fg-secondary">
              Taking a little longer — your radar will keep filling in.
            </p>
            <Button
              variant="primary"
              onClick={goToRadar}
              data-testid="onboarding-customising-continue"
            >
              Continue anyway
            </Button>
          </m.div>
        )}
        {failed && (
          <m.div
            key="failed"
            {...inlineReveal}
            role="alert"
            className="flex flex-col items-center gap-3"
          >
            <p className="flex items-center gap-2 text-body text-fg">
              <AlertCircle className="size-4 text-danger" strokeWidth={1.5} aria-hidden="true" />
              Couldn’t finish setting up. Check your connection.
            </p>
            <Button
              variant="primary"
              onClick={() => void run()}
              data-testid="onboarding-customising-retry"
            >
              Try again
            </Button>
          </m.div>
        )}
      </AnimatePresence>
    </section>
  );
}
