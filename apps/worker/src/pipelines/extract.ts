import { canonicaliseSkills, type Eligibility, normaliseCountry, parseDeadline } from '@kestrel/shared';

import { extractByRules } from '../lib/extract-rules.js';
import type { LlmExtraction } from '../lib/llm.js';
import { type ExtractMethod, type ListingDoc, ListingModel } from '../models/index.js';

import type { PipelineDeps } from './deps.js';

export interface ExtractOutcome {
  listingId: string;
  status: 'extracted' | 'cached' | 'missing';
  method: ExtractMethod;
}

const union = (...lists: readonly (readonly string[])[]) => [...new Set(lists.flat())];

function mergeEligibility(source: Eligibility, extracted: Eligibility): Eligibility {
  return {
    gradYears: source.gradYears.length ? source.gradYears : extracted.gradYears,
    degrees: source.degrees.length ? source.degrees : extracted.degrees,
    minExperienceYears: source.minExperienceYears ?? extracted.minExperienceYears,
    citizenship: source.citizenship.length ? source.citizenship : extracted.citizenship,
    other: union(source.other, extracted.other).slice(0, 20),
  };
}

function fromLlm(llm: LlmExtraction): Eligibility {
  return {
    gradYears: llm.eligibility.gradYears,
    degrees: llm.eligibility.degrees.map((d) => d.trim()).filter(Boolean),
    minExperienceYears: llm.eligibility.minExperienceYears,
    citizenship: llm.eligibility.citizenship.map((c) => normaliseCountry(c)).filter((c): c is string => c !== null),
    other: llm.eligibility.other.map((o) => o.trim()).filter(Boolean),
  };
}

/**
 * Structure + skills for one listing. ATS/public-API listings (structured) use the
 * deterministic rules only; crawled/RSS ones go to the server LLM (`generateObject`),
 * with the rules as fallback. Skipped when `extractedHash === contentHash`.
 */
export async function extractListing(deps: PipelineDeps, listingId: string): Promise<ExtractOutcome> {
  const l = await ListingModel.findById(listingId, { embedding: 0 }).lean<ListingDoc>();
  if (!l || l.archived) return { listingId, status: 'missing', method: 'none' };
  if (l.extractedHash === l.contentHash) return { listingId, status: 'cached', method: l.extractMethod };
  const now = deps.now();

  const rules = extractByRules({ title: l.title, descriptionMd: l.descriptionMd, country: l.country, now });
  let required = rules.skillsRequired;
  let nice = rules.skillsNice;
  let eligibility = rules.eligibility;
  let deadline = rules.deadline;
  let stipend = rules.stipend;
  let remote = rules.remote;
  let type = l.type;
  let method: ExtractMethod = 'rules';

  if (!l.structured && deps.llm && l.descriptionMd.trim().length > 80) {
    try {
      const llm = await deps.llm.extractListing({ title: l.title, company: l.company, descriptionMd: l.descriptionMd, contentHash: l.contentHash });
      method = 'llm';
      required = union(canonicaliseSkills(llm.skillsRequired), required).slice(0, 40);
      nice = union(canonicaliseSkills(llm.skillsNice), nice).filter((s) => !required.includes(s)).slice(0, 40);
      eligibility = mergeEligibility(fromLlm(llm), rules.eligibility);
      if (llm.deadline) {
        const parsed = parseDeadline(llm.deadline, { now });
        if (parsed.kind === 'date') deadline = { at: parsed.at, kind: 'date' };
        else if (parsed.kind === 'rolling') deadline = { at: null, kind: 'rolling' };
      }
      if (llm.stipend && (llm.stipend.min !== null || llm.stipend.max !== null) && llm.stipend.currency && llm.stipend.period) {
        stipend = { min: llm.stipend.min, max: llm.stipend.max, currency: llm.stipend.currency.toUpperCase(), period: llm.stipend.period };
      }
      if (llm.remote !== 'unknown') remote = llm.remote;
      if (llm.type) type = llm.type;
    } catch (err) {
      deps.logger.warn({ listingId, err: err instanceof Error ? err.message : String(err) }, 'llm extraction failed; rules only');
      deps.metrics.inc('beacon_worker_llm_failures_total', { op: 'extract' }, 1, 'LLM calls that failed after retries');
    }
  }

  // Source-provided structure always wins; extraction fills the gaps.
  const set: Partial<ListingDoc> = {
    skillsRequired: union(l.skillsRequired, required).slice(0, 100),
    skillsNice: nice.filter((s) => !l.skillsRequired.includes(s)).slice(0, 100),
    eligibility: mergeEligibility(l.eligibility, eligibility),
    extractedHash: l.contentHash,
    extractMethod: method,
  };
  if (l.skillsNice.length) set.skillsNice = union(l.skillsNice, set.skillsNice ?? []).slice(0, 100);
  if (!l.deadlineAt && deadline.at) {
    set.deadlineAt = deadline.at;
    set.deadlineKind = 'date';
  } else if (!l.deadlineAt && l.deadlineKind === 'unknown' && deadline.kind === 'rolling') {
    set.deadlineKind = 'rolling';
  }
  if (l.stipendMin === null && l.stipendMax === null && stipend) {
    set.stipendMin = stipend.min;
    set.stipendMax = stipend.max;
    set.currency = stipend.currency;
    set.period = stipend.period;
  }
  if (l.remote === 'unknown' && remote !== 'unknown') set.remote = remote;
  if (!l.structured && type !== l.type) set.type = type;

  await ListingModel.updateOne({ _id: l._id, contentHash: l.contentHash }, { $set: set });
  deps.metrics.inc('beacon_worker_extractions_total', { method }, 1, 'Listing extractions by method');
  return { listingId, status: 'extracted', method };
}
