import { z } from 'zod';

import { LIMITS, NUDGE_KINDS, TRACKER_STAGES } from '../constants';
import {
  dateSchema,
  httpUrlSchema,
  idSchema,
  nonEmptyTrimmed,
  opportunityTypeSchema,
} from './common';

export const trackerStageSchema = z.enum(TRACKER_STAGES);

export const trackerContactSchema = z.object({
  name: nonEmptyTrimmed(120),
  role: z.string().trim().max(120).nullable().default(null),
  email: z.email().max(320).nullable().default(null),
  url: httpUrlSchema.nullable().default(null),
  notes: z.string().max(2_000).nullable().default(null),
});
export type TrackerContact = z.infer<typeof trackerContactSchema>;

export const TRACKER_DOCUMENT_KINDS = ['resume', 'cover_letter', 'portfolio', 'other'] as const;

export const trackerDocumentSchema = z.object({
  name: nonEmptyTrimmed(160),
  url: httpUrlSchema,
  kind: z.enum(TRACKER_DOCUMENT_KINDS).default('other'),
  addedAt: dateSchema,
});
export type TrackerDocument = z.infer<typeof trackerDocumentSchema>;

export const trackerNudgeSchema = z.object({
  kind: z.enum(NUDGE_KINDS),
  dueAt: dateSchema,
  sentAt: dateSchema.nullable().default(null),
  dismissedAt: dateSchema.nullable().default(null),
});
export type TrackerNudge = z.infer<typeof trackerNudgeSchema>;

export const trackerItemSchema = z.object({
  id: idSchema,
  userId: idSchema,
  /** Null for manually added applications that are not in the listings collection. */
  listingId: idSchema.nullable().default(null),
  /** Snapshot so the card survives listing archival. */
  title: nonEmptyTrimmed(300),
  company: nonEmptyTrimmed(300),
  type: opportunityTypeSchema.nullable().default(null),
  applyUrl: httpUrlSchema.nullable().default(null),
  deadlineAt: dateSchema.nullable().default(null),
  /** Source of the listing, for "response rate per source" analytics. */
  sourceId: idSchema.nullable().default(null),
  stage: trackerStageSchema.default('saved'),
  /** Sort order inside a Kanban column (fractional indexing friendly). */
  position: z.number().default(0),
  notes: z.string().max(LIMITS.notesMax).default(''),
  contacts: z.array(trackerContactSchema).max(50).default([]),
  documents: z.array(trackerDocumentSchema).max(50).default([]),
  appliedAt: dateSchema.nullable().default(null),
  /** Last stage change / response; drives follow-up nudges. */
  lastActivityAt: dateSchema,
  nudges: z.array(trackerNudgeSchema).max(50).default([]),
  createdAt: dateSchema,
  updatedAt: dateSchema,
});
export type TrackerItem = z.infer<typeof trackerItemSchema>;

/** POST /tracker: from a listing, or a manual entry with title + company. */
export const trackerCreateSchema = z.union([
  z.object({
    listingId: idSchema,
    stage: trackerStageSchema.optional(),
    notes: z.string().max(LIMITS.notesMax).optional(),
  }),
  z.object({
    title: nonEmptyTrimmed(300),
    company: nonEmptyTrimmed(300),
    type: opportunityTypeSchema.optional(),
    applyUrl: httpUrlSchema.optional(),
    deadlineAt: dateSchema.optional(),
    stage: trackerStageSchema.optional(),
    notes: z.string().max(LIMITS.notesMax).optional(),
  }),
]);
export type TrackerCreate = z.infer<typeof trackerCreateSchema>;

/** PATCH /tracker/:id */
export const trackerUpdateSchema = z.object({
  notes: z.string().max(LIMITS.notesMax).optional(),
  contacts: z.array(trackerContactSchema).max(50).optional(),
  documents: z.array(trackerDocumentSchema).max(50).optional(),
  appliedAt: dateSchema.nullable().optional(),
  deadlineAt: dateSchema.nullable().optional(),
});
export type TrackerUpdate = z.infer<typeof trackerUpdateSchema>;

/** POST /tracker/:id/move (Kanban drop). */
export const trackerMoveSchema = z.object({
  stage: trackerStageSchema,
  position: z.number(),
});
export type TrackerMove = z.infer<typeof trackerMoveSchema>;
