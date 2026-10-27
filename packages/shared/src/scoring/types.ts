import type { DeadlineKind, OpportunityType, PayPeriod, RemoteMode } from '../constants';
import type { Eligibility } from '../schemas/listing';
import type { DegreeLevel, RemotePref, StipendFloor } from '../schemas/profile';
import type { Weights } from '../schemas/weights';

/** Structural subset of `Profile` used by scoring. Every field is optional. */
export interface ScoringProfile {
  skills?: readonly { name: string }[];
  education?: readonly { gradYear: number; degree?: string; degreeLevel?: DegreeLevel }[];
  experienceYears?: number;
  preferredRoles?: readonly string[];
  preferredLocations?: readonly string[];
  remotePref?: RemotePref;
  openToRelocate?: boolean;
  stipendFloor?: StipendFloor | null;
  workAuth?: { citizenship?: readonly string[] };
}

/** Structural subset of `Listing` / `ListingPublic` / `ListingDraft` used by scoring. */
export interface ScoringListing {
  type: OpportunityType;
  title: string;
  company: string;
  location?: readonly string[];
  remote?: RemoteMode;
  country?: string | null;
  stipendMin?: number | null;
  stipendMax?: number | null;
  currency?: string | null;
  period?: PayPeriod | null;
  postedAt?: Date | null;
  deadlineAt?: Date | null;
  deadlineKind?: DeadlineKind;
  firstSeenAt?: Date | null;
  eligibility?: Partial<Eligibility>;
  skillsRequired?: readonly string[];
  skillsNice?: readonly string[];
  ghostRisk?: { score: number } | null;
  roleFamily?: string | null;
}

export interface ComputeFitInput {
  profile: ScoringProfile;
  listing: ScoringListing;
  /** Raw slider values; normalised internally. Defaults to SPEC §4 weights. */
  weights?: Partial<Weights> | null;
  /** Clock for freshness/deadline terms. Defaults to `new Date()`. */
  now?: Date;
  /** Cosine similarity of profile and listing embeddings; omit/null when unavailable. */
  semantic?: number | null;
}
