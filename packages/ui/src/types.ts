import {
  Briefcase,
  FlaskConical,
  GitBranch,
  GraduationCap,
  Trophy,
  type LucideIcon,
} from 'lucide-react';

/** Mirrors `OpportunityType` in @kestrel/shared (kept local so this package stays dependency-free). */
export type OpportunityTypeKey =
  | 'internship'
  | 'fulltime'
  | 'hackathon'
  | 'scholarship'
  | 'fellowship'
  | 'research'
  | 'opensource';

export const TYPE_META: Record<OpportunityTypeKey, { label: string; icon: LucideIcon }> = {
  internship: { label: 'Internship', icon: Briefcase },
  fulltime: { label: 'Full-time', icon: Briefcase },
  hackathon: { label: 'Hackathon', icon: Trophy },
  scholarship: { label: 'Scholarship', icon: GraduationCap },
  fellowship: { label: 'Fellowship', icon: GraduationCap },
  research: { label: 'Research', icon: FlaskConical },
  opensource: { label: 'Open source', icon: GitBranch },
};
