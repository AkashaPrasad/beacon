import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';

import { nextPathFor, useMe } from '@/api';
import { OnboardingFrame } from '@/features/onboarding/components/OnboardingFrame';
import { PreferencesStep } from '@/features/onboarding/components/PreferencesStep';
import { ResumeStep } from '@/features/onboarding/components/ResumeStep';
import { SourcesStep } from '@/features/onboarding/components/SourcesStep';
import {
  directionBetween,
  isStepId,
  previousStep,
  stepPath,
  type StepId,
} from '@/features/onboarding/lib/steps';

/**
 * `/onboarding/:step` — the three-step wizard (USERFLOW §1.3–1.6). One persistent frame; only the step
 * content transitions, sliding in the direction of travel. Progress is saved after every step
 * (`PATCH /v1/me { onboardingStep }`), so a closed tab resumes where it left off.
 */
export function OnboardingFlow() {
  const { step: param } = useParams();
  const navigate = useNavigate();
  const me = useMe();
  const step: StepId | null = isStepId(param) ? param : null;
  // Direction of travel, derived when the step changes (forward +1, back -1).
  const [travel, setTravel] = useState<{ step: StepId | null; direction: 1 | -1 }>({ step, direction: 1 });
  if (step && step !== travel.step) setTravel({ step, direction: directionBetween(travel.step, step) });
  const direction = travel.direction;
  const mounted = useRef(false);

  useEffect(() => {
    if (!step) return undefined;
    if (!mounted.current) {
      mounted.current = true;
      return undefined;
    }
    // Move focus to the new step's title so assistive tech announces it (after the enter starts).
    const raf = requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-testid="onboarding-step-${step}"] h1`)
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [step]);

  if (!step) {
    if (me.data) return <Navigate to={nextPathFor(me.data)} replace />;
    return <Navigate to={stepPath('resume')} replace />;
  }
  if (me.data && !me.data.onboarding.consent) return <Navigate to="/welcome" replace />;

  const back = previousStep(step);
  const go = (to: StepId) => void navigate(stepPath(to));

  return (
    <OnboardingFrame step={step} direction={direction} onBack={back ? () => go(back) : null}>
      {step === 'resume' && <ResumeStep onDone={() => go('preferences')} />}
      {step === 'preferences' && <PreferencesStep onDone={() => go('sources')} />}
      {step === 'sources' && <SourcesStep onDone={() => void navigate('/radar', { replace: true })} />}
    </OnboardingFrame>
  );
}
