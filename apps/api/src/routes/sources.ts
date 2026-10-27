import {
  decodeCursor,
  detectSourceRequestSchema,
  encodeCursor,
  REFRESH_INTERVAL_MS,
  sourceUpdateSchema,
  tryNormaliseUrl,
} from '@kestrel/shared';
import { Router } from 'express';
import type { Types } from 'mongoose';

import type { AppContext } from '../context.js';
import { badCursor, badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { redisKeys, utcDay, withTimeout } from '../lib/redis.js';
import { escapeRegex, objectIdParam, parse } from '../lib/validate.js';
import { currentUser } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { Subscription } from '../models/activity.js';
import { Source, type SourceDoc } from '../models/source.js';
import { communitySourcesQuerySchema, sourceCreateBodySchema } from '../schemas/index.js';
import { getPack, loadPacks, resolvePackId, type PackInfo } from '../seed/packs.js';
import { toSourceDTO } from '../services/serialize.js';
import { detectSource, matchAtsUrl, toFetchUrl, type DetectResult } from '../sources/detect.js';

async function packDTO(userId: Types.ObjectId, pack: PackInfo) {
  const [sourceCount, subscribed] = await Promise.all([
    Source.countDocuments({ scope: 'community', packIds: pack.id }),
    Subscription.exists({ userId, packId: pack.id }),
  ]);
  return {
    id: pack.id,
    name: pack.name,
    sourceCount: sourceCount || pack.sources.length,
    kinds: pack.kinds,
    optional: pack.optional,
    enabled: Boolean(subscribed),
  };
}

function enqueueIngest(ctx: AppContext, sourceId: string, reason: 'created' | 'enabled' | 'pack') {
  return ctx.queue.add('ingest', { sourceId, reason }, { dedupId: `ingest:${sourceId}`, dedupTtlMs: 60_000 });
}

function enqueueMatch(ctx: AppContext, userId: string) {
  return ctx.queue.add('match', { userId, reason: 'sources' }, { dedupId: `match:${userId}` });
}

export function createSourcesRouter(ctx: AppContext): Router {
  const router = Router();
  const detectLimiter = createRateLimiter('detect', ctx.rateLimits.detect, ctx.redis, 'user');
  const detectDeps = () => ({
    fetchImpl: ctx.fetch,
    resolveDns: ctx.resolveDns,
  });

  router.get('/sources', async (req, res) => {
    const { _id } = currentUser(req);
    const docs = await Source.find({ scope: 'personal', ownerId: _id }).sort({ createdAt: -1 }).lean<SourceDoc[]>();
    res.json({ items: docs.map(toSourceDTO) });
  });

  router.post('/sources/detect', detectLimiter, async (req, res) => {
    const { url } = parse(detectSourceRequestSchema, req.body);
    res.json(await detectSource(url, detectDeps()));
  });

  router.get('/sources/credits', async (req, res) => {
    const { id } = currentUser(req);
    const day = utcDay(ctx.now());
    let values: (string | null)[] = [null, null, null, null];
    try {
      values = await withTimeout(
        ctx.redis.mget(
          redisKeys.crawlerCredits(day),
          redisKeys.crawlerSelfHosted(day),
          redisKeys.crawlerUser(id, day),
          redisKeys.crawlerBackend,
        ),
        1_500,
        'credits',
      );
    } catch (err) {
      ctx.logger.warn({ err: (err as Error).message }, 'credit meter unavailable');
    }
    const num = (v: string | null | undefined) => (v && Number.isFinite(Number(v)) ? Number(v) : 0);
    res.json({
      date: day,
      cloudUsedToday: num(values[0]),
      cap: ctx.env.FIRECRAWL_DAILY_CREDIT_CAP,
      selfHostedUsedToday: num(values[1]),
      backend: values[3] === 'selfhosted' ? 'selfhosted' : 'cloud',
      userUsedToday: num(values[2]),
    });
  });

  router.get('/sources/packs', async (req, res) => {
    const { _id } = currentUser(req);
    res.json({ items: await Promise.all(loadPacks().map((p) => packDTO(_id, p))) });
  });

  router.post('/sources/packs/:packId/enable', async (req, res) => {
    const { _id, id } = currentUser(req);
    const packId = resolvePackId(String(req.params['packId']));
    const pack = packId ? getPack(packId) : undefined;
    if (!pack) throw notFound('Source pack');
    const sources = await Source.find({ scope: 'community', packIds: pack.id }).lean<SourceDoc[]>();
    if (sources.length) {
      await Subscription.bulkWrite(
        sources.map((s) => ({
          updateOne: {
            filter: { userId: _id, sourceId: s._id },
            update: { $setOnInsert: { userId: _id, sourceId: s._id, packId: pack.id } },
            upsert: true,
          },
        })),
        { ordered: false },
      );
    }
    const now = ctx.now().getTime();
    const stale = sources.filter(
      (s) => s.enabled && (!s.lastCheckedAt || now - new Date(s.lastCheckedAt).getTime() > REFRESH_INTERVAL_MS[s.refreshInterval]),
    );
    await Promise.all(stale.map((s) => enqueueIngest(ctx, s._id.toString(), 'pack')));
    await enqueueMatch(ctx, id);
    res.json({ pack: await packDTO(_id, pack), subscribed: sources.length, ingestQueued: stale.length });
  });

  router.post('/sources/packs/:packId/disable', async (req, res) => {
    const { _id, id } = currentUser(req);
    const packId = resolvePackId(String(req.params['packId']));
    const pack = packId ? getPack(packId) : undefined;
    if (!pack) throw notFound('Source pack');
    const result = await Subscription.deleteMany({ userId: _id, packId: pack.id });
    await enqueueMatch(ctx, id);
    res.json({ pack: await packDTO(_id, pack), unsubscribed: result.deletedCount });
  });

  router.get('/sources/community', async (req, res) => {
    const { _id } = currentUser(req);
    const q = parse(communitySourcesQuerySchema, req.query, 'query');
    const filter: Record<string, unknown> = { scope: 'community' };
    if (q.pack) {
      const packId = resolvePackId(q.pack);
      if (!packId) {
        res.json({ items: [], nextCursor: null });
        return;
      }
      filter['packIds'] = packId;
    }
    if (q.kind) filter['kind'] = q.kind;
    if (q.q) filter['name'] = { $regex: escapeRegex(q.q), $options: 'i' };
    if (q.cursor) {
      const cursor = decodeCursor(q.cursor);
      const after = cursor?.['id'];
      if (typeof after !== 'string' || !/^[a-f0-9]{24}$/i.test(after)) throw badCursor();
      filter['_id'] = { $gt: objectIdParam(after) };
    }
    const docs = await Source.find(filter).sort({ _id: 1 }).limit(q.limit + 1).lean<SourceDoc[]>();
    const page = docs.slice(0, q.limit);
    const subscribed = new Set(
      (await Subscription.find({ userId: _id, sourceId: { $in: page.map((d) => d._id) } }).distinct('sourceId')).map(String),
    );
    const last = page.at(-1);
    res.json({
      items: page.map((d) => ({ ...toSourceDTO(d), subscribed: subscribed.has(d._id.toString()) })),
      nextCursor: docs.length > q.limit && last ? encodeCursor({ id: last._id.toString() }) : null,
    });
  });

  router.post('/sources', async (req, res) => {
    const { _id, id } = currentUser(req);
    const body = parse(sourceCreateBodySchema, req.body);
    const target = toFetchUrl(body.url);
    const url = tryNormaliseUrl(target.toString());
    if (!url) throw badRequest('Enter a valid http(s) URL');
    const existing = await Source.findOne({ scope: 'personal', ownerId: _id, url }, { _id: 1 }).lean();
    if (existing) throw conflict('You already added this source', { existingId: existing._id.toString() });

    let detection: DetectResult | null = null;
    let kind = body.kind;
    let boardToken = body.boardToken ?? null;
    let feedUrl = body.feedUrl ?? null;
    let extra: Partial<DetectResult['config']> = {};
    let name = body.name ?? null;
    let companyDomain: string | null = null;
    if (!kind) {
      detection = await detectSource(target.toString(), detectDeps());
      kind = detection.kind;
      boardToken = detection.boardToken;
      feedUrl = detection.config.feedUrl;
      extra = detection.config;
      name ??= detection.name;
      companyDomain = detection.companyDomain;
    } else if (!boardToken) {
      boardToken = matchAtsUrl(target)?.token ?? null;
    }
    const doc = await Source.create({
      url,
      name: (name ?? target.hostname.replace(/^www\./, '')).slice(0, 160),
      kind,
      scope: 'personal',
      ownerId: _id,
      typeTag: body.typeTag ?? null,
      enabled: body.enabled ?? true,
      refreshInterval: body.refreshInterval ?? (kind === 'firecrawl' ? 'weekly' : 'daily'),
      health: 'pending',
      config: { ...extra, boardToken, feedUrl, provider: extra.provider ?? null },
      companyDomain,
    });
    const created = doc.toObject() as SourceDoc;
    if (created.enabled) await enqueueIngest(ctx, created._id.toString(), 'created');
    await enqueueMatch(ctx, id);
    res.status(201).json({ source: toSourceDTO(created), detection });
  });

  async function loadOwned(userId: Types.ObjectId, rawId: unknown, allowCommunity: boolean): Promise<SourceDoc> {
    const sourceId = objectIdParam(rawId, 'Source');
    const doc = await Source.findById(sourceId).lean<SourceDoc>();
    if (!doc) throw notFound('Source');
    if (doc.scope === 'community') {
      if (allowCommunity) return doc;
      throw forbidden('Community sources are shared and read-only');
    }
    if (!doc.ownerId?.equals(userId)) throw notFound('Source');
    return doc;
  }

  router.get('/sources/:id', async (req, res) => {
    const doc = await loadOwned(currentUser(req)._id, req.params['id'], true);
    res.json({ source: toSourceDTO(doc) });
  });

  router.patch('/sources/:id', async (req, res) => {
    const { _id } = currentUser(req);
    const before = await loadOwned(_id, req.params['id'], false);
    const patch = parse(sourceUpdateSchema, req.body);
    const updated = await Source.findByIdAndUpdate(before._id, { $set: patch }, { returnDocument: 'after' }).lean<SourceDoc>();
    if (!updated) throw notFound('Source');
    if (patch.enabled === true && !before.enabled) await enqueueIngest(ctx, updated._id.toString(), 'enabled');
    res.json({ source: toSourceDTO(updated) });
  });

  router.delete('/sources/:id', async (req, res) => {
    const { _id, id } = currentUser(req);
    const doc = await loadOwned(_id, req.params['id'], false);
    await Source.deleteOne({ _id: doc._id });
    await enqueueMatch(ctx, id);
    res.status(204).end();
  });

  return router;
}
