/**
 * React binding for the detection state machine: 400 ms debounce after a valid URL, one request per
 * settled URL (shared per-URL cache with onboarding step 3), stale responses ignored by request id.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useReducer, useRef } from 'react';

import {
  DETECT_DEBOUNCE_MS,
  detectErrorFrom,
  detectReducer,
  initialDetectState,
  type DetectError,
} from './detect-machine';

import { detectSource } from '@/api/sources';
import { isApiError } from '@/lib/api';

export function toDetectError(error: unknown): DetectError {
  if (isApiError(error)) {
    if (error.code === 'NETWORK' || error.code === 'TIMEOUT') return detectErrorFrom(0, null);
    return detectErrorFrom(error.status, {
      error: {
        code: error.code,
        message: error.message,
        details: {
          ...(typeof error.details === 'object' && error.details ? (error.details as Record<string, unknown>) : {}),
          ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
        },
      },
    });
  }
  return detectErrorFrom(500, null);
}

export function useSourceDetection(initialInput = '') {
  const qc = useQueryClient();
  const [state, dispatch] = useReducer(detectReducer, initialInput, (input) =>
    input ? detectReducer(initialDetectState, { type: 'input', value: input }) : initialDetectState,
  );
  const requestId = useRef(0);

  const run = useCallback(
    (url: string, type: 'start' | 'retry') => {
      requestId.current += 1;
      const id = requestId.current;
      dispatch({ type, requestId: id });
      detectSource(qc, url).then(
        (result) => dispatch({ type: 'success', requestId: id, result }),
        (error: unknown) => dispatch({ type: 'failure', requestId: id, error: toDetectError(error) }),
      );
    },
    [qc],
  );

  const pendingUrl = state.status === 'typing' ? state.url : null;
  useEffect(() => {
    if (!pendingUrl) return undefined;
    const timer = setTimeout(() => run(pendingUrl, 'start'), DETECT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [pendingUrl, run]);

  const setInput = useCallback((value: string) => dispatch({ type: 'input', value }), []);
  const reset = useCallback(() => dispatch({ type: 'reset' }), []);
  const retry = useCallback(() => {
    if ('url' in state && state.url) {
      void qc.removeQueries({ queryKey: ['sources', 'detect', state.url] });
      run(state.url, 'retry');
    }
  }, [qc, run, state]);
  /** Detect immediately (paste / Enter), skipping the debounce. */
  const detectNow = useCallback(() => {
    if (state.status === 'typing' && state.url) run(state.url, 'start');
  }, [run, state]);

  return { state, setInput, reset, retry, detectNow };
}
