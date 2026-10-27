import { Clock, Ghost, ShieldCheck, type LucideIcon } from 'lucide-react';

export type GhostRiskLevelKey = 'low' | 'medium' | 'high';

export const GHOST_META: Record<
  GhostRiskLevelKey,
  { label: string; icon: LucideIcon; className: string }
> = {
  low: {
    label: 'Looks active',
    icon: ShieldCheck,
    className: 'bg-ghost-low-subtle text-ghost-low',
  },
  medium: { label: 'Possibly stale', icon: Clock, className: 'bg-ghost-med-subtle text-ghost-med' },
  high: { label: 'Likely ghost', icon: Ghost, className: 'bg-ghost-high-subtle text-ghost-high' },
};

/** Same thresholds as `ghostRiskLevel` in @kestrel/shared: < 30 low, < 60 medium, else high. */
export function ghostLevelOf(score: number): GhostRiskLevelKey {
  return score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';
}
