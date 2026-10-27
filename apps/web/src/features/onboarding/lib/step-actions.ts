import { createContext, useContext, useEffect } from 'react';

import type { StepId } from './steps';

/** What the persistent action bar shows for the current step. Steps own the logic; the frame owns layout. */
export interface StepActions {
  /** Primary action. Return a promise to show the pending state. */
  onContinue: () => void | Promise<void>;
  continueLabel?: string;
  /** Pending (saving) state of the primary action. */
  pending?: boolean;
  onSkip?: () => void | Promise<void>;
  skipPending?: boolean;
  /** Optional meta line in the bar ("≈ 1,240 open listings match so far"). */
  meta?: string | null;
  /** Disable the primary action (rare: only while a prerequisite is loading). */
  disabled?: boolean;
}

export interface StepActionsRegistry {
  /** Cheap to call every render: the frame keeps handlers in a ref and re-renders only on visible changes. */
  register: (step: StepId, actions: StepActions | null) => void;
}

/** The parts of `StepActions` that change what the bar looks like. */
export function visibleSignature(a: StepActions | null | undefined): string {
  if (!a) return '';
  return JSON.stringify([a.continueLabel, a.pending, a.skipPending, Boolean(a.onSkip), a.meta, a.disabled]);
}

export const StepActionsContext = createContext<StepActionsRegistry>({ register: () => undefined });

/**
 * Registers the current step's actions with the onboarding frame. During the cross-step transition
 * both steps are mounted; the frame shows the actions registered for the step in the URL.
 */
export function useStepActions(step: StepId, actions: StepActions): void {
  const { register } = useContext(StepActionsContext);
  useEffect(() => {
    register(step, actions);
  });
  useEffect(() => () => register(step, null), [register, step]);
}
