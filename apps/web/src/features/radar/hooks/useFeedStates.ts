/**
 * State hooks behind the radar's honest states (MOTION §5.7 skeleton timing, USERFLOW §3.1 summary
 * dismissal). Kept apart from the components so Fast Refresh stays component-only.
 */
import { useEffect, useRef, useState } from 'react';

import { SKELETON_DELAY_MS, SKELETON_MIN_MS } from '../lib/motion';

/** True while the skeleton should be visible: after 150 ms of loading, and for at least 300 ms. */
export function useSkeletonGate(loading: boolean): boolean {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);
  useEffect(() => {
    if (loading) {
      const t = setTimeout(() => {
        shownAt.current = performance.now();
        setVisible(true);
      }, SKELETON_DELAY_MS);
      return () => clearTimeout(t);
    }
    const remaining = Math.max(0, SKELETON_MIN_MS - (performance.now() - shownAt.current));
    const t = setTimeout(() => setVisible(false), remaining);
    return () => clearTimeout(t);
  }, [loading]);
  return visible;
}

// ── Since last visit (DESIGN §6.2, USERFLOW §3.1) ────────────────────────────

const DISMISS_KEY = 'beacon:radar:summary-dismissed';

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

export function useSummaryDismissal(lastSeenFeedAt: Date | null) {
  const marker = lastSeenFeedAt ? lastSeenFeedAt.toISOString() : null;
  const [dismissed, setDismissed] = useState(() => readDismissed());
  return {
    dismissed: marker != null && dismissed === marker,
    dismiss: () => {
      if (!marker) return;
      try {
        localStorage.setItem(DISMISS_KEY, marker);
      } catch {
        // ignore: the strip just reappears next visit
      }
      setDismissed(marker);
    },
  };
}

