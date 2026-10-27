import { alertRuleInputSchema, alertRulePatchSchema, decodeCursor, encodeCursor } from '@kestrel/shared';
import { Router } from 'express';
import type { Types } from 'mongoose';

import type { AppContext } from '../context.js';
import { badCursor, HttpError, notFound } from '../lib/errors.js';
import { objectIdParam, parse, toObjectId } from '../lib/validate.js';
import { currentUser } from '../middleware/auth.js';
import {
  AlertRule,
  Notification,
  PushSubscription,
  type AlertRuleDoc,
  type NotificationDoc,
  type PushSubscriptionDoc,
} from '../models/activity.js';
import {
  notificationsQuerySchema,
  notificationsReadSchema,
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
} from '../schemas/index.js';
import { toAlertDTO, toNotificationDTO, toPushDTO } from '../services/serialize.js';

async function loadRule(userId: Types.ObjectId, rawId: unknown): Promise<AlertRuleDoc> {
  const id = objectIdParam(rawId, 'Alert rule');
  const doc = await AlertRule.findOne({ _id: id, userId }).lean<AlertRuleDoc>();
  if (!doc) throw notFound('Alert rule');
  return doc;
}

/** Router for public (unauthenticated) push endpoints. */
export function createPublicPushRouter(ctx: AppContext): Router {
  const router = Router();
  router.get('/push/vapid-public-key', (_req, res) => {
    if (!ctx.env.VAPID_PUBLIC_KEY) {
      throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Web push is not configured on this server');
    }
    res.json({ publicKey: ctx.env.VAPID_PUBLIC_KEY });
  });
  return router;
}

export function createAlertsRouter(ctx: AppContext): Router {
  const router = Router();

  // ── Alert rules ──
  router.get('/alerts', async (req, res) => {
    const docs = await AlertRule.find({ userId: currentUser(req)._id }).sort({ createdAt: 1 }).lean<AlertRuleDoc[]>();
    res.json({ items: docs.map(toAlertDTO) });
  });

  router.post('/alerts', async (req, res) => {
    const { _id } = currentUser(req);
    const body = parse(alertRuleInputSchema, req.body);
    const created = await AlertRule.create({ ...body, userId: _id });
    res.status(201).json({ rule: toAlertDTO(created.toObject() as AlertRuleDoc) });
  });

  router.get('/alerts/:id', async (req, res) => {
    res.json({ rule: toAlertDTO(await loadRule(currentUser(req)._id, req.params['id'])) });
  });

  router.patch('/alerts/:id', async (req, res) => {
    const { _id } = currentUser(req);
    const rule = await loadRule(_id, req.params['id']);
    const { conditions, ...rest } = parse(alertRulePatchSchema, req.body);
    const set: Record<string, unknown> = { ...rest };
    for (const [key, value] of Object.entries(conditions ?? {})) {
      if (value !== undefined) set[`conditions.${key}`] = value;
    }
    const updated = await AlertRule.findOneAndUpdate({ _id: rule._id, userId: _id }, { $set: set }, { returnDocument: 'after' }).lean<AlertRuleDoc>();
    if (!updated) throw notFound('Alert rule');
    res.json({ rule: toAlertDTO(updated) });
  });

  router.delete('/alerts/:id', async (req, res) => {
    const { _id } = currentUser(req);
    const rule = await loadRule(_id, req.params['id']);
    await AlertRule.deleteOne({ _id: rule._id, userId: _id });
    res.status(204).end();
  });

  router.post('/alerts/:id/test', async (req, res) => {
    const { _id, id } = currentUser(req);
    const rule = await loadRule(_id, req.params['id']);
    const jobId = await ctx.queue.add('notify', { userId: id, alertRuleId: rule._id.toString(), test: true });
    if (!jobId) throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'The notification queue is unavailable; try again shortly');
    res.status(202).json({ queued: true, jobId });
  });

  // ── Push subscriptions ──
  router.get('/push/subscriptions', async (req, res) => {
    const docs = await PushSubscription.find({ userId: currentUser(req)._id }).sort({ createdAt: -1 }).lean<PushSubscriptionDoc[]>();
    res.json({ items: docs.map(toPushDTO) });
  });

  router.post('/push/subscriptions', async (req, res) => {
    const { _id } = currentUser(req);
    const body = parse(pushSubscriptionSchema, req.body);
    const doc = await PushSubscription.findOneAndUpdate(
      { endpoint: body.endpoint },
      {
        $set: {
          userId: _id,
          keys: body.keys,
          expirationTime: body.expirationTime ?? null,
          userAgent: body.userAgent ?? req.get('user-agent')?.slice(0, 512) ?? null,
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    ).lean<PushSubscriptionDoc>();
    res.status(201).json({ subscription: toPushDTO(doc!) });
  });

  router.delete('/push/subscriptions', async (req, res) => {
    const { endpoint } = parse(pushUnsubscribeSchema, req.body);
    await PushSubscription.deleteOne({ endpoint, userId: currentUser(req)._id });
    res.status(204).end();
  });

  router.delete('/push/subscriptions/:id', async (req, res) => {
    const { _id } = currentUser(req);
    const id = objectIdParam(req.params['id'], 'Push subscription');
    const result = await PushSubscription.deleteOne({ _id: id, userId: _id });
    if (!result.deletedCount) throw notFound('Push subscription');
    res.status(204).end();
  });

  // ── Notifications ──
  router.get('/notifications', async (req, res) => {
    const { _id } = currentUser(req);
    const q = parse(notificationsQuerySchema, req.query, 'query');
    const filter: Record<string, unknown> = { userId: _id };
    if (q.unreadOnly) filter['readAt'] = null;
    if (q.cursor) {
      const cursor = decodeCursor(q.cursor);
      const t = cursor?.['t'];
      const cid = cursor?.['id'];
      if (typeof t !== 'number' || typeof cid !== 'string' || !/^[a-f0-9]{24}$/i.test(cid)) throw badCursor();
      const at = new Date(t);
      filter['$or'] = [{ createdAt: { $lt: at } }, { createdAt: at, _id: { $lt: toObjectId(cid) } }];
    }
    const [docs, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1, _id: -1 }).limit(q.limit + 1).lean<NotificationDoc[]>(),
      Notification.countDocuments({ userId: _id, readAt: null }),
    ]);
    const page = docs.slice(0, q.limit);
    const last = page.at(-1);
    res.json({
      items: page.map(toNotificationDTO),
      nextCursor:
        docs.length > q.limit && last ? encodeCursor({ t: new Date(last.createdAt).getTime(), id: last._id.toString() }) : null,
      unreadCount,
    });
  });

  router.post('/notifications/read', async (req, res) => {
    const { _id } = currentUser(req);
    const body = parse(notificationsReadSchema, req.body);
    const filter: Record<string, unknown> = { userId: _id, readAt: null };
    if ('ids' in body) filter['_id'] = { $in: body.ids.map(toObjectId) };
    const result = await Notification.updateMany(filter, { $set: { readAt: ctx.now() } });
    const unreadCount = await Notification.countDocuments({ userId: _id, readAt: null });
    res.json({ updated: result.modifiedCount, unreadCount });
  });

  return router;
}
