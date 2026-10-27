/* eslint-disable react-refresh/only-export-components -- Co-located public hook/context API. */
/**
 * Onboarding state: the student, their working profile, the saved answers and the sequence, plus the
 * actions every question page uses. Writes never block navigation: profile fields go through the
 * optimistic profile mutation (paused offline, replayed in order), and progress is saved through
 * `PATCH /v1/profile/onboarding` with a local mirror, so a closed tab resumes on the same question.
 */
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { queryKeys } from '@/api/keys';
import {
  progressFromMe,
  saveOnboardingProgress,
  usePatchProfileOptimistic,
  type OnboardingAnswers,
  type OnboardingProgress,
} from '@/api/profile';
import type { MeResponse, ProfileResponse } from '@/api/types';
import { toDraft, type ProfileDraft } from '@/features/profile/lib/profile-model';
import { api, errorMessage } from '@/lib/api';
import { readJson, writeJson } from '@/lib/storage';
import type { ProfilePatch } from '@kestrel/shared';

import {
  autoAfterResume,
  buildSequence,
  hasStarted,
  initialAuto,
  legacyStepFor,
  markStep,
  nextStep,
  previousStep,
  stepPath,
  type StepId,
} from './steps';

export const progressKey = (userId: string) => `beacon:onboarding:${userId}`;

interface StoredProgress {
  step: string | null;
  answers: OnboardingAnswers;
  updatedAt: string | null;
}

/** Server progress, unless the local mirror is newer (a save that hasn't reached the API yet). */
export function initialProgress(me: MeResponse): OnboardingProgress {
  const server = progressFromMe(me);
  const local = readJson<StoredProgress | null>(progressKey(me.user.id), null);
  const localAt = local?.updatedAt ? new Date(local.updatedAt).getTime() : 0;
  const serverAt = server?.updatedAt?.getTime() ?? 0;
  if (local && (!server || localAt > serverAt)) {
    return {
      step: local.step,
      answers: local.answers ?? {},
      updatedAt: local.updatedAt ? new Date(local.updatedAt) : null,
    };
  }
  return server ?? { step: null, answers: {}, updatedAt: null };
}

export type FlowMode = 'setup' | 'edit';

export interface CompleteOptions {
  /** Answers to merge before moving on. */
  answers?: Partial<OnboardingAnswers>;
  /** Profile fields this answer sets (saved optimistically; they also decide the conditional steps). */
  profile?: ProfilePatch;
  how?: 'answered' | 'skipped';
}

export interface OnboardingContextValue {
  me: MeResponse;
  profile: ProfileResponse;
  draft: ProfileDraft;
  answers: OnboardingAnswers;
  savedStep: string | null;
  sequence: StepId[];
  mode: FlowMode;
  /** Edit mode: where Continue returns to (`review` or an app path). */
  returnTo: string | null;
  /** "Aarav" (first word of the name), or null when we don't know it. */
  firstName: string | null;
  /** True on the first page of a visit that resumed earlier progress ("Welcome back"). */
  resumed: boolean;
  /** Optimistic profile write; resolves when the server confirmed it. */
  patchProfile: (patch: ProfilePatch) => Promise<unknown>;
  /** Merge answers and persist them (and the current step). */
  updateAnswers: (
    step: StepId,
    update: (prev: OnboardingAnswers) => OnboardingAnswers,
  ) => OnboardingAnswers;
  /** Mark a step answered/skipped, persist, and move to the next page (or back to `returnTo`). */
  complete: (step: StepId, options?: CompleteOptions) => void;
  back: (step: StepId) => void;
  canGoBack: (step: StepId) => boolean;
  goTo: (step: StepId, search?: string) => void;
  /** Resolves once every profile/progress write started by the flow has settled. */
  settleWrites: () => Promise<void>;
  /** Track a write the customising screen must wait for (pack toggles, sources). */
  track: <T>(promise: Promise<T>) => Promise<T>;
  /** Records the resume-answered questions once "Here's what we found" is confirmed. */
  applyResumeAutoSkips: (draft: ProfileDraft) => OnboardingAnswers;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding() outside <OnboardingProvider>');
  return ctx;
}

export function useOptionalOnboarding(): OnboardingContextValue | null {
  return useContext(OnboardingContext);
}

function firstNameOf(me: MeResponse): string | null {
  const name = me.user.name?.trim();
  if (!name) return null;
  const local = me.user.email?.split('@')[0]?.toLowerCase() ?? '';
  if (name.toLowerCase() === local) return null;
  return name.split(/\s+/)[0] ?? null;
}

export function OnboardingProvider({
  me,
  profile,
  mode,
  returnTo,
  children,
}: {
  me: MeResponse;
  profile: ProfileResponse;
  mode: FlowMode;
  returnTo: string | null;
  children: ReactNode;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const patch = usePatchProfileOptimistic();
  const draft = useMemo(() => toDraft(profile.profile), [profile.profile]);

  const [progress] = useState(() => initialProgress(me));
  const [answers, setAnswers] = useState<OnboardingAnswers>(() => {
    const a = progress.answers;
    if (a.auto) return a;
    // First visit: auto-skip every question the account or profile already answers.
    return { ...a, auto: initialAuto({ me, draft, answers: a }) };
  });
  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);
  const [resumed, setResumed] = useState(() => mode === 'setup' && hasStarted(progress.answers));
  const writes = useRef(new Set<Promise<unknown>>());
  const lastLegacy = useRef<string | null>(null);
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());

  const track = useCallback(<T,>(promise: Promise<T>): Promise<T> => {
    const p = promise.catch(() => undefined);
    writes.current.add(p);
    void p.finally(() => writes.current.delete(p));
    return promise;
  }, []);

  /** Persist the step and answers: local mirror now, server in order (one request at a time). */
  const persist = useCallback(
    (step: StepId, next: OnboardingAnswers) => {
      if (mode === 'edit') {
        // Editing after onboarding: only answers that aren't profile fields need saving.
        writeJson(progressKey(me.user.id), {
          step: 'done',
          answers: next,
          updatedAt: new Date().toISOString(),
        });
      } else {
        writeJson(progressKey(me.user.id), {
          step,
          answers: next,
          updatedAt: new Date().toISOString(),
        });
      }
      const body = mode === 'edit' ? { answers: next } : { step, answers: next };
      const run = saveChain.current.then(async () => {
        const saved = await saveOnboardingProgress(qc, body).catch(() => undefined);
        if (saved === null && mode === 'setup') {
          // Older API: keep its coarse step in sync so the guards resume close to the right page.
          const legacy = legacyStepFor(step);
          if (legacy !== lastLegacy.current) {
            lastLegacy.current = legacy;
            await api.patch('/v1/me', { onboardingStep: legacy }).catch(() => undefined);
          }
        }
      });
      saveChain.current = run;
      void track(run);
    },
    [mode, me.user.id, qc, track],
  );

  const updateAnswers = useCallback<OnboardingContextValue['updateAnswers']>(
    (step, update) => {
      const next = update(answersRef.current);
      answersRef.current = next;
      setAnswers(next);
      persist(step, next);
      return next;
    },
    [persist],
  );

  const patchProfile = useCallback(
    (body: ProfilePatch) => {
      if (Object.keys(body).length === 0) return Promise.resolve();
      const promise = patch.mutateAsync(body);
      promise.catch((error: unknown) => {
        toast.error(
          errorMessage(error, 'Couldn’t save that answer. We’ll keep it here; try again.'),
          {
            duration: 8000,
            action: {
              label: 'Retry',
              onClick: () => void patch.mutateAsync(body).catch(() => undefined),
            },
          },
        );
      });
      return track(promise);
    },
    [patch, track],
  );

  const goTo = useCallback(
    (step: StepId, search = '') =>
      void navigate(stepPath(step, search), { state: { explicit: true } }),
    [navigate],
  );

  const complete = useCallback<OnboardingContextValue['complete']>(
    (step, options = {}) => {
      const how = options.how ?? 'answered';
      const merged = { ...answersRef.current, ...options.answers };
      const next = markStep(merged, step, how);
      if (options.profile) void patchProfile(options.profile);
      // The conditional steps read the answer just given, before the optimistic write lands.
      const sequence = buildSequence(next, {
        ...draft,
        ...(options.profile as Partial<ProfileDraft>),
      });
      const target = mode === 'edit' || returnTo ? null : nextStep(step, sequence);
      updateAnswers(target ?? (returnTo === 'review' ? 'review' : step), () => next);
      setResumed(false);
      if (returnTo === 'review') {
        goTo('review');
        return;
      }
      if (returnTo) {
        void navigate(returnTo);
        return;
      }
      if (target) goTo(target);
    },
    [draft, goTo, mode, navigate, patchProfile, returnTo, updateAnswers],
  );

  const sequence = useMemo(() => buildSequence(answers, draft), [answers, draft]);

  const back = useCallback(
    (step: StepId) => {
      if (returnTo === 'review') return goTo('review');
      if (returnTo) return void navigate(returnTo);
      const prev = previousStep(step, sequence);
      if (prev) goTo(prev);
    },
    [goTo, navigate, returnTo, sequence],
  );

  const canGoBack = useCallback(
    (step: StepId) => Boolean(returnTo) || previousStep(step, sequence) !== null,
    [returnTo, sequence],
  );

  const settleWrites = useCallback(async () => {
    // New writes can start while earlier ones settle (a save chains the next); loop until quiet.
    for (let i = 0; i < 5 && writes.current.size > 0; i += 1) {
      await Promise.allSettled([...writes.current]);
    }
  }, []);

  const applyResumeAutoSkips = useCallback(
    (confirmed: ProfileDraft) => ({
      ...answersRef.current,
      auto: autoAfterResume({ me, draft: confirmed, answers: answersRef.current }),
    }),
    [me],
  );

  const value = useMemo<OnboardingContextValue>(
    () => ({
      me,
      profile,
      draft,
      answers,
      savedStep: progress.step,
      sequence,
      mode,
      returnTo,
      firstName: firstNameOf(me),
      resumed,
      patchProfile,
      updateAnswers,
      complete,
      back,
      canGoBack,
      goTo,
      settleWrites,
      track,
      applyResumeAutoSkips,
    }),
    [
      me,
      profile,
      draft,
      answers,
      progress.step,
      sequence,
      mode,
      returnTo,
      resumed,
      patchProfile,
      updateAnswers,
      complete,
      back,
      canGoBack,
      goTo,
      settleWrites,
      track,
      applyResumeAutoSkips,
    ],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

/** Latest cached profile draft (for writes that must build on edits made a moment ago). */
export function latestDraft(qc: ReturnType<typeof useQueryClient>): ProfileDraft | null {
  const data = qc.getQueryData<ProfileResponse>(queryKeys.profile);
  return data ? toDraft(data.profile) : null;
}
