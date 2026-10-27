import { Router } from 'express';
import type { Types } from 'mongoose';

import {
  DAY_MS,
  NUDGE_FOLLOW_UP_DAYS,
  NUDGE_GHOSTED_DAYS,
  TRACKER_STAGES,
  type TrackerStage,
} from '@kestrel/shared';

import type { AppContext } from '../context.js';
import { conflict, notFound } from '../lib/errors.js';
import { objectIdParam, parse, toObjectId } from '../lib/validate.js';
import { currentUser } from '../middleware/auth.js';
import { TrackerItem, type TrackerItemDoc } from '../models/activity.js';
import { Listing, type ListingDoc } from '../models/listing.js';
import { Source, type SourceDoc } from '../models/source.js';
import {
  trackerCreateBodySchema,
  trackerListQuerySchema,
  trackerMoveBodySchema,
  trackerPatchSchema,
} from '../schemas/index.js';
import { toTrackerDTO } from '../services/serialize.js';
import {
  APPLIED_STAGES,
  compactColumn,
  createTrackerItem,
  trackerFieldsFor,
} from '../services/tracker.js';
import { canSeeListing } from '../services/visibility.js';

const RESPONSE_STAGES = new Set<string>(['oa', 'interview', 'offer', 'rejected']);
const stageOrder = (stage: string) => TRACKER_STAGES.indexOf(stage as TrackerStage);

async function loadItem(userId: Types.ObjectId, rawId: unknown): Promise<TrackerItemDoc> {
  const id = objectIdParam(rawId, 'Tracker item');
  const doc = await TrackerItem.findOne({ _id: id, userId }).lean<TrackerItemDoc>();
  if (!doc) throw notFound('Tracker item');
  return doc;
}

async function reindex(
  userId: Types.ObjectId,
  stage: string,
  orderedIds: Types.ObjectId[],
): Promise<void> {
  if (!orderedIds.length) return;
  await TrackerItem.bulkWrite(
    orderedIds.map((id, position) => ({
      updateOne: { filter: { _id: id, userId }, update: { $set: { position, stage } } },
    })),
  );
}

/**
 * Move an item to `stage` at 0-based `index`; both affected columns are re-indexed to 0..n-1.
 * Stage changes append history, bump lastActivityAt, clear pending nudges, and stamp appliedAt.
 */
export async function moveItem(
  ctx: AppContext,
  item: TrackerItemDoc,
  stage: TrackerStage,
  index: number,
) {
  const now = ctx.now();
  const userId = item.userId;
  const column = await TrackerItem.find({ userId, stage, _id: { $ne: item._id } }, { _id: 1 })
    .sort({ position: 1, createdAt: 1 })
    .lean<{ _id: Types.ObjectId }[]>();
  const target = Math.max(0, Math.min(Math.round(index), column.length));
  const ordered = column.map((c) => c._id);
  ordered.splice(target, 0, item._id);

  if (stage !== item.stage) {
    const update: Record<string, unknown> = {
      lastActivityAt: now,
      nudges: (item.nudges ?? []).filter((n) => n.sentAt || n.dismissedAt),
    };
    if (stage === 'applied' && !item.appliedAt) update['appliedAt'] = now;
    await TrackerItem.updateOne(
      { _id: item._id },
      { $set: update, $push: { history: { stage, at: now } } },
    );
    const source = await TrackerItem.find(
      { userId, stage: item.stage, _id: { $ne: item._id } },
      { _id: 1 },
    )
      .sort({ position: 1, createdAt: 1 })
      .lean<{ _id: Types.ObjectId }[]>();
    await reindex(
      userId,
      item.stage,
      source.map((s) => s._id),
    );
  }
  await reindex(userId, stage, ordered);
  const updated = await TrackerItem.findById(item._id).lean<TrackerItemDoc>();
  return {
    item: toTrackerDTO(updated!),
    column: ordered.map((id, position) => ({ id: id.toString(), position })),
  };
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return Math.round(value * 10) / 10;
}

export function computeAnalytics(
  items: TrackerItemDoc[],
  sourceNames: Map<string, string>,
  now: Date,
) {
  const stageCounts = Object.fromEntries(TRACKER_STAGES.map((s) => [s, 0])) as Record<
    TrackerStage,
    number
  >;
  const applied: TrackerItemDoc[] = [];
  const responded: TrackerItemDoc[] = [];
  const responseDays: number[] = [];
  for (const item of items) {
    if (item.stage in stageCounts) stageCounts[item.stage as TrackerStage] += 1;
    const history = item.history ?? [];
    const wasApplied =
      Boolean(item.appliedAt) ||
      APPLIED_STAGES.has(item.stage) ||
      history.some((h) => APPLIED_STAGES.has(h.stage));
    if (!wasApplied) continue;
    applied.push(item);
    const appliedAt =
      item.appliedAt ?? history.find((h) => h.stage === 'applied')?.at ?? item.createdAt;
    const response = history.find(
      (h) => RESPONSE_STAGES.has(h.stage) && new Date(h.at) >= new Date(appliedAt),
    );
    if (response || RESPONSE_STAGES.has(item.stage)) {
      responded.push(item);
      if (response)
        responseDays.push(
          (new Date(response.at).getTime() - new Date(appliedAt).getTime()) / DAY_MS,
        );
    }
  }

  const bySource = new Map<string, { applied: number; responded: number }>();
  const respondedIds = new Set(responded.map((r) => r._id.toString()));
  for (const item of applied) {
    if (!item.sourceId) continue;
    const key = item.sourceId.toString();
    const entry = bySource.get(key) ?? { applied: 0, responded: 0 };
    entry.applied += 1;
    if (respondedIds.has(item._id.toString())) entry.responded += 1;
    bySource.set(key, entry);
  }
  const bestSources = [...bySource.entries()]
    .map(([sourceId, v]) => ({
      sourceId,
      name: sourceNames.get(sourceId) ?? 'Unknown source',
      applied: v.applied,
      responded: v.responded,
      responseRate: v.applied ? Math.round((v.responded / v.applied) * 1000) / 1000 : 0,
    }))
    .sort((a, b) => b.responseRate - a.responseRate || b.applied - a.applied)
    .slice(0, 5);

  const waiting = items
    .filter((i) => i.stage === 'applied')
    .map((i) => ({
      id: i._id.toString(),
      title: i.title,
      company: i.company,
      appliedAt: i.appliedAt ?? null,
      daysSinceActivity: Math.floor(
        (now.getTime() - new Date(i.lastActivityAt ?? i.updatedAt).getTime()) / DAY_MS,
      ),
    }));

  return {
    total: items.length,
    applied: applied.length,
    responded: responded.length,
    responseRate: applied.length
      ? Math.round((responded.length / applied.length) * 1000) / 1000
      : 0,
    medianResponseDays: median(responseDays),
    stageCounts,
    bestSources,
    followUp: waiting.filter(
      (w) =>
        w.daysSinceActivity >= NUDGE_FOLLOW_UP_DAYS && w.daysSinceActivity < NUDGE_GHOSTED_DAYS,
    ),
    moveOn: waiting.filter((w) => w.daysSinceActivity >= NUDGE_GHOSTED_DAYS),
  };
}

export function createTrackerRouter(ctx: AppContext): Router {
  const router = Router();

  router.get('/tracker', async (req, res) => {
    const { _id } = currentUser(req);
    const { stage } = parse(trackerListQuerySchema, req.query, 'query');
    const docs = await TrackerItem.find({ userId: _id, ...(stage ? { stage } : {}) })
      .sort({ position: 1, createdAt: 1 })
      .lean<TrackerItemDoc[]>();
    docs.sort((a, b) => stageOrder(a.stage) - stageOrder(b.stage) || a.position - b.position);
    res.json({ items: docs.map(toTrackerDTO) });
  });

  router.get('/tracker/analytics', async (req, res) => {
    const { _id } = currentUser(req);
    const items = await TrackerItem.find({ userId: _id }).lean<TrackerItemDoc[]>();
    const sourceIds = [
      ...new Set(items.flatMap((i) => (i.sourceId ? [i.sourceId.toString()] : []))),
    ];
    const sources = await Source.find(
      { _id: { $in: sourceIds.map(toObjectId) } },
      { name: 1 },
    ).lean<SourceDoc[]>();
    res.json(
      computeAnalytics(items, new Map(sources.map((s) => [s._id.toString(), s.name])), ctx.now()),
    );
  });

  router.post('/tracker', async (req, res) => {
    const { _id } = currentUser(req);
    const body = parse(trackerCreateBodySchema, req.body);
    const stage = body.stage ?? 'saved';
    let doc: Partial<TrackerItemDoc>;
    if ('listingId' in body) {
      const listingId = objectIdParam(body.listingId, 'Listing');
      const listing = await Listing.findById(listingId).lean<ListingDoc>();
      if (!listing || !(await canSeeListing(_id, listing))) throw notFound('Listing');
      const existing = await TrackerItem.findOne({ userId: _id, listingId }, { _id: 1 }).lean();
      if (existing)
        throw conflict('This listing is already in your tracker', {
          existingId: existing._id.toString(),
        });
      doc = trackerFieldsFor(listing);
    } else {
      const manual = 'manual' in body ? { ...body.manual, applyUrl: body.manual.url } : body;
      doc = {
        listingId: null,
        title: manual.title,
        company: manual.company,
        type: manual.type ?? null,
        applyUrl: manual.applyUrl ?? null,
        deadlineAt: manual.deadlineAt ?? null,
      };
    }
    const created = await createTrackerItem(ctx, _id, doc, stage, body.notes ?? '');
    res.status(201).json({ item: toTrackerDTO(created) });
  });

  router.get('/tracker/:id', async (req, res) => {
    const item = await loadItem(currentUser(req)._id, req.params['id']);
    res.json({ item: toTrackerDTO(item) });
  });

  router.patch('/tracker/:id', async (req, res) => {
    const { _id } = currentUser(req);
    const item = await loadItem(_id, req.params['id']);
    const { stage, ...patch } = parse(trackerPatchSchema, req.body);
    if (Object.keys(patch).length) {
      await TrackerItem.updateOne(
        { _id: item._id },
        { $set: { ...patch, lastActivityAt: ctx.now() } },
      );
    }
    if (stage && stage !== item.stage) {
      const fresh = await loadItem(_id, item._id.toString());
      const { item: moved } = await moveItem(ctx, fresh, stage, 0);
      res.json({ item: moved });
      return;
    }
    res.json({ item: toTrackerDTO(await loadItem(_id, item._id.toString())) });
  });

  router.post('/tracker/:id/move', async (req, res) => {
    const { _id } = currentUser(req);
    const item = await loadItem(_id, req.params['id']);
    const { stage, position, fromStage, ifUnmodifiedSince } = parse(
      trackerMoveBodySchema,
      req.body,
    );
    const stale =
      (fromStage !== undefined && fromStage !== item.stage) ||
      (ifUnmodifiedSince !== undefined &&
        new Date(item.updatedAt).getTime() > ifUnmodifiedSince.getTime());
    if (stale) {
      throw conflict('This card changed in another tab; the board has been refreshed', {
        reason: 'stale',
        item: toTrackerDTO(item),
      });
    }
    res.json(await moveItem(ctx, item, stage, position));
  });

  router.delete('/tracker/:id', async (req, res) => {
    const { _id } = currentUser(req);
    const item = await loadItem(_id, req.params['id']);
    await TrackerItem.deleteOne({ _id: item._id });
    await compactColumn(_id, item.stage);
    res.status(204).end();
  });

  return router;
}
