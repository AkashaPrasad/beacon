import { useIsMutating } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useCallback, useEffect, useState, type ComponentType } from 'react';
import { Navigate, useLocation, useNavigationType, useParams, useSearchParams } from 'react-router';

import { isOnboarded, useMe, useProfile } from '@/api';
import type { MeResponse, ProfileResponse } from '@/api/types';
import { safeNext } from '@/app/safe-next';
import { Button } from '@/components/ui/button';
import {
  AnnounceContext,
  LiveRegion,
  ProgressHeader,
} from '@/features/onboarding/components/Chrome';
import {
  OnboardingProvider,
  useOnboarding,
  type FlowMode,
} from '@/features/onboarding/flow/context';
import {
  positionOf,
  resolveEntry,
  STEP_LABELS,
  STEP_ORDER,
  stepPath,
  type StepId,
} from '@/features/onboarding/flow/steps';
import { stepVariants } from '@/features/onboarding/lib/motion';
import { CompaniesStep } from '@/features/onboarding/steps/CompaniesStep';
import { CustomisingStep } from '@/features/onboarding/steps/CustomisingStep';
import { EducationStep } from '@/features/onboarding/steps/EducationStep';
import { EmailStep } from '@/features/onboarding/steps/EmailStep';
import { FoundStep } from '@/features/onboarding/steps/FoundStep';
import { LocationStep } from '@/features/onboarding/steps/LocationStep';
import { NameStep } from '@/features/onboarding/steps/NameStep';
import { PacksStep } from '@/features/onboarding/steps/PacksStep';
import { ResumeStep } from '@/features/onboarding/steps/ResumeStep';
import { ReviewStep } from '@/features/onboarding/steps/ReviewStep';
import { RolesStep } from '@/features/onboarding/steps/RolesStep';
import { StackStep } from '@/features/onboarding/steps/StackStep';
import { StipendStep } from '@/features/onboarding/steps/StipendStep';
import { TypesStep } from '@/features/onboarding/steps/TypesStep';
import { WorkAuthStep } from '@/features/onboarding/steps/WorkAuthStep';
import { errorMessage } from '@/lib/api';
import { Skeleton } from '@kestrel/ui';

const STEP_VIEWS: Record<StepId, ComponentType> = {
  email: EmailStep,
  name: NameStep,
  education: EducationStep,
  resume: ResumeStep,
  found: FoundStep,
  types: TypesStep,
  roles: RolesStep,
  stack: StackStep,
  location: LocationStep,
  stipend: StipendStep,
  'work-auth': WorkAuthStep,
  companies: CompaniesStep,
  packs: PacksStep,
  review: ReviewStep,
  customising: CustomisingStep,
};

/** The question page's geometry while `/v1/me` and the profile load (no spinner, no jump). */
function QuestionSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col" data-testid="onboarding-page" data-step="loading">
      <div className="glass h-14 border-b" />
      <div
        className="mx-auto flex w-full max-w-[40rem] flex-col gap-4 px-gutter pt-16"
        role="status"
        aria-label="Loading your setup"
      >
        <Skeleton className="h-10 w-4/5 rounded-md" />
        <Skeleton className="h-5 w-3/5" />
        <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div
      className="grid min-h-dvh place-items-center px-gutter"
      data-testid="onboarding-page"
      data-step="error"
    >
      <div
        role="alert"
        className="e2 flex max-w-md flex-col items-start gap-3 rounded-xl border border-border-subtle p-6"
      >
        <p className="flex items-center gap-2 text-body font-medium text-fg">
          <AlertCircle className="size-4 text-danger" strokeWidth={1.5} aria-hidden="true" />
          Couldn’t load your setup.
        </p>
        <p className="text-small text-fg-secondary">{errorMessage(error)}</p>
        <Button variant="primary" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  );
}

function returnTarget(raw: string | null, onboarded: boolean): string | null {
  if (raw === 'review') return 'review';
  const safe = raw ? safeNext(raw) : null;
  if (safe) return safe;
  return onboarded ? '/profile' : null;
}

/**
 * `/onboarding/:step` — the conversational setup (docs/ONBOARDING.md). One question per full page;
 * forward slides in from the right, Back from the left; the progress strip and the live region stay
 * put while only the question transitions.
 */
export function Component() {
  const me = useMe();
  const profile = useProfile();
  const [search] = useSearchParams();
  if (me.isError && !me.data)
    return <LoadError error={me.error} onRetry={() => void me.refetch()} />;
  if (profile.isError && !profile.data)
    return <LoadError error={profile.error} onRetry={() => void profile.refetch()} />;
  // The persisted cache may hold an older profile; the auto-skips must come from the current one.
  const fresh = profile.isFetchedAfterMount || !profile.isStale || profile.isError;
  if (!me.data || !profile.data || !fresh) return <QuestionSkeleton />;
  if (!me.data.onboarding.consent) return <Navigate to="/welcome" replace />;
  return <Loaded me={me.data} profile={profile.data} returnParam={search.get('return')} />;
}

function Loaded({
  me,
  profile,
  returnParam,
}: {
  me: MeResponse;
  profile: ProfileResponse;
  returnParam: string | null;
}) {
  // Decided once: finishing onboarding mid-flow (customising) must not flip the page into edit mode.
  const [onboarded] = useState(() => isOnboarded(me));
  const mode: FlowMode = onboarded ? 'edit' : 'setup';
  const returnTo = returnTarget(returnParam, onboarded);
  return (
    <OnboardingProvider me={me} profile={profile} mode={mode} returnTo={returnTo}>
      <Flow />
    </OnboardingProvider>
  );
}

function Flow() {
  const flow = useOnboarding();
  const { step: param } = useParams();
  const location = useLocation();
  const navigationType = useNavigationType();
  const explicit = Boolean((location.state as { explicit?: boolean } | null)?.explicit);
  const [announcement, setAnnouncement] = useState('');
  const announce = useCallback((text: string) => setAnnouncement(text), []);
  const pendingWrites = useIsMutating({ mutationKey: ['profile', 'patch'] });

  const resolved: StepId =
    flow.mode === 'edit' &&
    (!param ||
      (param === 'resume' && String(navigationType) === 'REPLACE' && !explicit) ||
      param === 'customising')
      ? 'review'
      : resolveEntry(
          param,
          explicit ? 'PUSH' : navigationType,
          flow.sequence,
          flow.answers,
          flow.savedStep,
        );

  // Direction of travel: forward (+1) or back (−1), from the steps' order.
  const [previous, setPrevious] = useState(resolved);
  const [direction, setDirection] = useState<1 | -1>(1);
  if (previous !== resolved) {
    setDirection(STEP_ORDER.indexOf(resolved) < STEP_ORDER.indexOf(previous) ? -1 : 1);
    setPrevious(resolved);
  }

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [resolved]);

  if (param !== resolved) {
    return <Navigate to={stepPath(resolved, location.search)} replace state={{ explicit: true }} />;
  }

  const View = STEP_VIEWS[resolved];
  const { index, total } = positionOf(resolved, flow.sequence);
  const counted = flow.mode === 'setup' && resolved !== 'customising';
  const answeredOnce =
    (flow.answers.answered?.length ?? 0) + (flow.answers.skipped?.length ?? 0) > 0;

  return (
    <AnnounceContext.Provider value={announce}>
      <div
        data-testid="onboarding-page"
        data-step={resolved}
        data-mode={flow.mode}
        className="relative flex min-h-dvh flex-col"
      >
        <ProgressHeader
          index={counted ? index : null}
          total={total}
          label={STEP_LABELS[resolved]}
          saved={answeredOnce && pendingWrites === 0}
          editing={flow.mode === 'edit' ? STEP_LABELS[resolved] : null}
        />
        <main id="main" className="relative flex-1 overflow-x-clip">
          <AnimatePresence initial={false} mode="popLayout" custom={direction}>
            <m.div
              key={resolved}
              custom={direction}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="w-full"
              data-testid={`onboarding-step-${resolved}`}
            >
              <View />
            </m.div>
          </AnimatePresence>
        </main>
        <LiveRegion text={announcement} />
      </div>
    </AnnounceContext.Provider>
  );
}
