export { dedupeListings, listingRichness, type DedupeCandidate } from './dedupe';
export { computeFit } from './fit';
export {
  ghostRisk,
  type ApplyUrlCheck,
  type GhostRiskContext,
  type GhostRiskListing,
} from './ghost';
export { cosineSimilarity } from './similarity';
export type { ComputeFitInput, ScoringListing, ScoringProfile } from './types';
