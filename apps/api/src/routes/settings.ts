import { Router, type Response } from 'express';
import type { Model, Types } from 'mongoose';

import {
  normaliseWeights,
  settingsPatchSchema,
  weightsInputSchema,
  type AiProvider,
} from '@kestrel/shared';

import { byokConfig, PROVIDER_BASE_URLS, serverConfig, testLlm, type LlmConfig } from '../ai/llm.js';
import type { AppContext } from '../context.js';
import { aiKeyAad, encryptSecret } from '../lib/crypto.js';
import { badRequest, HttpError } from '../lib/errors.js';
import { assertPublicUrl } from '../lib/http.js';
import { redisKeys, utcDay, withTimeout } from '../lib/redis.js';
import { parse } from '../lib/validate.js';
import { clearSessionCookie, currentUser } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import {
  AlertRule,
  Explanation,
  Interaction,
  Match,
  Notification,
  PushSubscription,
  Subscription,
  TrackerItem,
} from '../models/activity.js';
import { Profile } from '../models/profile.js';
import { Settings, type SettingsDoc } from '../models/settings.js';
import { Source } from '../models/source.js';
import { User, type UserDoc } from '../models/user.js';
import { aiSettingsPutSchema, aiTestSchema } from '../schemas/index.js';
import { toAiSettingsDTO, toPublicUser, toSettingsDTO } from '../services/serialize.js';
import { getSettings } from '../services/settings.js';

function enqueueMatch(ctx: AppContext, userId: string) {
  return ctx.queue.add('match', { userId, reason: 'weights' }, { dedupId: `match:${userId}` });
}

async function checkBaseUrl(ctx: AppContext, baseUrl: string | null | undefined): Promise<void> {
  if (!baseUrl || ctx.env.NODE_ENV !== 'production') return;
  try {
    await assertPublicUrl(new URL(baseUrl), ctx.resolveDns);
  } catch {
    throw badRequest('baseUrl must be a public http(s) endpoint');
  }
}

/** Collections streamed into the export, keyed by userId. */
type OwnedModel = Model<{ userId: Types.ObjectId }>;
const owned = (m: unknown) => m as OwnedModel;
const EXPORT_COLLECTIONS: readonly [string, OwnedModel, Record<string, 0>][] = [
  ['subscriptions', owned(Subscription), {}],
  ['interactions', owned(Interaction), {}],
  ['matches', owned(Match), {}],
  ['tracker', owned(TrackerItem), {}],
  ['alerts', owned(AlertRule), {}],
  ['notifications', owned(Notification), {}],
  ['pushSubscriptions', owned(PushSubscription), { keys: 0 }],
  ['explanations', owned(Explanation), {}],
];

function write(res: Response, chunk: string): Promise<void> {
  return new Promise((resolve) => {
    if (res.write(chunk)) resolve();
    else res.once('drain', () => resolve());
  });
}

export async function deleteAccount(userId: Types.ObjectId): Promise<void> {
  await Promise.all([
    Profile.deleteMany({ userId }),
    Settings.deleteMany({ userId }),
    Source.deleteMany({ scope: 'personal', ownerId: userId }),
    Subscription.deleteMany({ userId }),
    Interaction.deleteMany({ userId }),
    Match.deleteMany({ userId }),
    Explanation.deleteMany({ userId }),
    TrackerItem.deleteMany({ userId }),
    AlertRule.deleteMany({ userId }),
    Notification.deleteMany({ userId }),
    PushSubscription.deleteMany({ userId }),
  ]);
  await User.deleteOne({ _id: userId });
}

export function createSettingsRouter(ctx: AppContext): Router {
  const router = Router();
  const aiTestLimiter = createRateLimiter('aitest', ctx.rateLimits.aitest, ctx.redis, 'user');

  router.get('/settings', async (req, res) => {
    res.json(toSettingsDTO(await getSettings(currentUser(req)._id)));
  });

  router.patch('/settings', async (req, res) => {
    const { _id, id } = currentUser(req);
    const patch = parse(settingsPatchSchema, req.body);
    const current = await getSettings(_id);
    const set: Record<string, unknown> = {};
    for (const group of ['appearance', 'notifications', 'privacy'] as const) {
      for (const [key, value] of Object.entries(patch[group] ?? {})) {
        if (value !== undefined) set[`${group}.${key}`] = value;
      }
    }
    if (patch.ai) {
      const { consent, ...ai } = patch.ai;
      await checkBaseUrl(ctx, ai.baseUrl);
      for (const [key, value] of Object.entries(ai)) if (value !== undefined) set[`ai.${key}`] = value;
      if (consent !== undefined) set['ai.consentGivenAt'] = consent ? ctx.now() : null;
    }
    let weightsChanged = false;
    if (patch.weights) {
      const merged = { ...current.weights, ...patch.weights };
      set['weights'] = parse(weightsInputSchema, merged);
      weightsChanged = JSON.stringify(normaliseWeights(current.weights)) !== JSON.stringify(normaliseWeights(merged));
    }
    const updated = await Settings.findOneAndUpdate({ userId: _id }, { $set: set }, { returnDocument: 'after' }).lean<SettingsDoc>();
    if (weightsChanged) await enqueueMatch(ctx, id);
    res.json(toSettingsDTO(updated!));
  });

  router.put('/settings/ai', async (req, res) => {
    const { _id, id } = currentUser(req);
    const body = parse(aiSettingsPutSchema, req.body);
    const current = await getSettings(_id);
    if (body.provider === 'custom' && !body.baseUrl) throw badRequest('A custom provider needs a baseUrl');
    await checkBaseUrl(ctx, body.baseUrl);
    const set: Record<string, unknown> = {
      'ai.provider': body.provider,
      'ai.enabled': body.enabled,
      'ai.baseUrl': body.baseUrl ?? null,
      'ai.model': body.model ?? null,
    };
    if (body.apiKey) {
      set['ai.keyCiphertext'] = encryptSecret(body.apiKey, ctx.encryptionKey, aiKeyAad(id));
      set['ai.keyLast4'] = body.apiKey.slice(-4);
    } else if (body.provider !== current.ai.provider) {
      // Never send a key saved for one provider to another one.
      set['ai.keyCiphertext'] = null;
      set['ai.keyLast4'] = null;
    }
    const updated = await Settings.findOneAndUpdate({ userId: _id }, { $set: set }, { returnDocument: 'after' }).lean<SettingsDoc>();
    res.json({ ai: toAiSettingsDTO(updated!.ai) });
  });

  router.delete('/settings/ai/key', async (req, res) => {
    const { _id } = currentUser(req);
    await getSettings(_id);
    const updated = await Settings.findOneAndUpdate(
      { userId: _id },
      { $set: { 'ai.keyCiphertext': null, 'ai.keyLast4': null } },
      { returnDocument: 'after' },
    ).lean<SettingsDoc>();
    res.json({ ai: toAiSettingsDTO(updated!.ai) });
  });

  router.get('/settings/ai/usage', async (req, res) => {
    const { id } = currentUser(req);
    const day = utcDay(ctx.now());
    let calls: string | null = null;
    let tokens: Record<string, string> = {};
    try {
      [calls, tokens] = await withTimeout(
        Promise.all([ctx.redis.get(redisKeys.llmCalls(id, day)), ctx.redis.hgetall(redisKeys.llmTokens(id, day))]),
        1_500,
        'ai usage',
      );
    } catch (err) {
      ctx.logger.warn({ err: (err as Error).message }, 'ai usage unavailable');
    }
    const num = (v: string | null | undefined) => (v && Number.isFinite(Number(v)) ? Number(v) : 0);
    res.json({
      date: day,
      calls: num(calls),
      cap: ctx.env.LLM_DAILY_USER_CAP,
      tokens: { prompt: num(tokens['prompt']), completion: num(tokens['completion']), total: num(tokens['total']) },
    });
  });

  router.post('/settings/ai/test', aiTestLimiter, async (req, res) => {
    const { _id, id } = currentUser(req);
    const body = parse(aiTestSchema, req.body ?? {});
    const settings = await getSettings(_id);
    let config: LlmConfig | null = null;
    const provider: AiProvider = body.provider ?? settings.ai.provider;
    if (body.apiKey || body.baseUrl || body.model || body.provider) {
      await checkBaseUrl(ctx, body.baseUrl);
      if (provider === 'default') {
        config = serverConfig(ctx);
      } else {
        const baseURL = body.baseUrl ?? settings.ai.baseUrl ?? PROVIDER_BASE_URLS[provider];
        const saved = provider === settings.ai.provider ? byokConfig(ctx, id, settings.ai) : null;
        const model = body.model ?? settings.ai.model ?? (saved && saved !== 'key_unreadable' ? saved.model : null);
        const apiKey = body.apiKey ?? (saved && saved !== 'key_unreadable' ? saved.apiKey : null);
        if (baseURL && model) config = { provider, baseURL, model, apiKey, source: 'byok' };
      }
    } else if (settings.ai.provider === 'default') {
      config = serverConfig(ctx);
    } else {
      const saved = byokConfig(ctx, id, settings.ai);
      config = saved === 'key_unreadable' ? null : saved;
    }
    if (!config) {
      throw new HttpError(422, 'AI_NOT_CONFIGURED', 'Nothing to test: choose a provider, model and key first');
    }
    const result = await testLlm(ctx, config);
    res.json({ ...result, model: config.model, provider: config.provider });
  });

  router.put('/settings/weights', async (req, res) => {
    const { _id, id } = currentUser(req);
    const weights = parse(weightsInputSchema, req.body);
    await getSettings(_id);
    await Settings.updateOne({ userId: _id }, { $set: { weights } });
    await enqueueMatch(ctx, id);
    res.json({ weights, normalised: normaliseWeights(weights) });
  });

  router.get('/settings/export', async (req, res) => {
    const user = currentUser(req);
    const userId = user._id;
    const fresh = await User.findById(userId).lean<UserDoc>();
    const [profile, settings, sources] = await Promise.all([
      Profile.findOne({ userId }, { embedding: 0 }).lean(),
      getSettings(userId),
      Source.find({ scope: 'personal', ownerId: userId }).lean(),
    ]);
    const day = ctx.now().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="beacon-export-${day}.json"`);
    res.setHeader('Cache-Control', 'no-store');
    await write(res, `{"exportedAt":${JSON.stringify(ctx.now())}`);
    await write(res, `,"user":${JSON.stringify(toPublicUser(fresh ?? user.doc))}`);
    await write(res, `,"profile":${JSON.stringify(profile)}`);
    await write(res, `,"settings":${JSON.stringify(toSettingsDTO(settings))}`);
    await write(res, `,"sources":${JSON.stringify(sources)}`);
    for (const [name, model, projection] of EXPORT_COLLECTIONS) {
      await write(res, `,${JSON.stringify(name)}:[`);
      let first = true;
      for await (const doc of model.find({ userId }, projection).lean().cursor()) {
        await write(res, `${first ? '' : ','}${JSON.stringify(doc)}`);
        first = false;
      }
      await write(res, ']');
    }
    res.end('}');
  });

  router.delete('/account', async (req, res) => {
    await deleteAccount(currentUser(req)._id);
    clearSessionCookie(ctx, res);
    res.status(204).end();
  });

  return router;
}
