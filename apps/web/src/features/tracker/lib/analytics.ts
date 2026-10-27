/**
 * Analytics header view model (DESIGN §10.4, USERFLOW §6): applied, response rate, median reply and
 * best sources. Response rate needs at least 3 applications to mean anything.
 */
import type { TrackerAnalytics } from '@/api/types';

export const MIN_APPLICATIONS_FOR_RATE = 3;

export interface AnalyticsView {
  applied: number;
  /** 0..100 when meaningful, else null (renders "—"). */
  responseRatePct: number | null;
  medianDays: number | null;
  responded: number;
  /** Up to 3 sources with at least one application, best rate first. */
  best: { id: string; name: string; ratePct: number; applied: number; responded: number }[];
  /** Caption under the header when the numbers are not meaningful yet. */
  note: string | null;
}

export function analyticsView(a: TrackerAnalytics | undefined): AnalyticsView {
  if (!a) return { applied: 0, responseRatePct: null, medianDays: null, responded: 0, best: [], note: null };
  const enough = a.applied >= MIN_APPLICATIONS_FOR_RATE;
  return {
    applied: a.applied,
    responded: a.responded,
    responseRatePct: enough ? Math.round(Math.max(0, Math.min(1, a.responseRate)) * 100) : null,
    medianDays: a.medianResponseDays == null ? null : Math.max(0, Math.round(a.medianResponseDays)),
    best: a.bestSources
      .filter((s) => s.applied > 0)
      .slice(0, 3)
      .map((s) => ({
        id: s.sourceId,
        name: s.name,
        ratePct: Math.round(Math.max(0, Math.min(1, s.responseRate)) * 100),
        applied: s.applied,
        responded: s.responded,
      })),
    note: enough ? null : 'Response rate appears after 3 applications.',
  };
}
