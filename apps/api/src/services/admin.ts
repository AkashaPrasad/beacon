/**
 * Admin account seeding (ADMIN_EMAIL / ADMIN_PASSWORD on boot) and the ops overview behind
 * `GET /v1/admin/overview`.
 */
import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { OPPORTUNITY_TYPES, SOURCE_HEALTH, SOURCE_KINDS, type OpportunityType } from '@kestrel/shared';

import type { AppContext } from '../context.js';
import type { Env } from '../env.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import type { QueueCounts } from '../lib/queues.js';
import { redisKeys, utcDay, withTimeout } from '../lib/redis.js';
import type { Logger } from '../logger.js';
import { Listing } from '../models/listing.js';
import { Source } from '../models/source.js';
import { User, type UserDoc } from '../models/user.js';

export type SeedAdminResult = 'skipped' | 'created' | 'promoted' | 'updated' | 'unchanged';

/**
 * Upsert the admin from the environment. An existing account with that email (for example the
 * owner's Google account) is promoted; the password hash is replaced only when the configured
 * password no longer verifies, so restarts do not rotate the hash.
 */
export async function seedAdmin(env: Pick<Env, 'ADMIN_EMAIL' | 'ADMIN_PASSWORD'>, cost: number, logger?: Logger): Promise<SeedAdminResult> {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) return 'skipped';
  const email = env.ADMIN_EMAIL.trim().toLowerCase();
  const candidates = await User.find({ email }).sort({ createdAt: 1 }).lean<UserDoc[]>();
  const existing = candidates.find((u) => u.passwordHash) ?? candidates[0];
  let result: SeedAdminResult;
  if (!existing) {
    await User.create({
      email,
      name: 'Beacon admin',
      googleSub: null,
      role: 'admin',
      passwordHash: await hashPassword(env.ADMIN_PASSWORD, cost),
      passwordSetAt: new Date(),
      onboardingStep: 'done',
      onboardingCompletedAt: new Date(),
    });
    result = 'created';
  } else {
    const set: Record<string, unknown> = {};
    if (existing.role !== 'admin') set['role'] = 'admin';
    const passwordOk = await verifyPassword(env.ADMIN_PASSWORD, existing.passwordHash);
    if (!passwordOk) {
      set['passwordHash'] = await hashPassword(env.ADMIN_PASSWORD, cost);
      set['passwordSetAt'] = new Date();
    }
    if (Object.keys(set).length === 0) {
      result = 'unchanged';
    } else {
      // A changed password also signs out the admin's existing sessions.
      await User.updateOne({ _id: existing._id }, { $set: set, ...(passwordOk ? {} : { $inc: { sessionVersion: 1 } }) });
      result = existing.role !== 'admin' ? 'promoted' : 'updated';
    }
  }
  logger?.info({ result }, 'admin account seeded');
  return result;
}

// ── sourceRuns (written by the worker; read-only here, no index declarations) ──

interface SourceRunDoc {
  _id: Types.ObjectId;
  sourceId: Types.ObjectId;
  reason: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  found: number;
  new: number;
  updated: number;
  unchanged: number;
  errors: { kind: string; message: string }[];
  backend: string | null;
  creditsUsed: number;
}

const sourceRunSchema = new Schema({}, { collection: 'sourceRuns', strict: false, autoIndex: false, autoCreate: false });
export const SourceRun: Model<SourceRunDoc> =
  (mongoose.models['ApiSourceRun'] as Model<SourceRunDoc> | undefined) ??
  mongoose.model<SourceRunDoc>('ApiSourceRun', sourceRunSchema as unknown as Schema<SourceRunDoc>);

function countsBy<K extends string>(keys: readonly K[], rows: { _id: string | null; n: number }[]): Record<K, number> {
  const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
  for (const { _id, n } of rows) {
    const key = (_id ?? 'unknown') as K;
    out[key] = (out[key] ?? 0) + n;
  }
  return out;
}

export async function adminOverview(ctx: AppContext) {
  const now = ctx.now();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const day = utcDay(now);
  const group = (field: string) => [{ $group: { _id: `$${field}`, n: { $sum: 1 } } }];

  const [users, admins, withPassword, withGoogle, newUsers, listingTotal, archived, byType, byHealth, byKind, byScope, runs] =
    await Promise.all([
      User.estimatedDocumentCount(),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ passwordHash: { $type: 'string' } }),
      User.countDocuments({ googleSub: { $type: 'string' } }),
      User.countDocuments({ createdAt: { $gte: weekAgo } }),
      Listing.estimatedDocumentCount(),
      Listing.countDocuments({ archived: true }),
      Listing.aggregate<{ _id: string; n: number }>([{ $match: { archived: { $ne: true } } }, ...group('type')]),
      Source.aggregate<{ _id: string; n: number }>(group('health')),
      Source.aggregate<{ _id: string; n: number }>(group('kind')),
      Source.aggregate<{ _id: string; n: number }>(group('scope')),
      SourceRun.find({}).sort({ startedAt: -1 }).limit(20).lean<SourceRunDoc[]>(),
    ]);

  const runSources = await Source.find(
    { _id: { $in: [...new Set(runs.map((r) => String(r.sourceId)))].filter((id) => /^[a-f0-9]{24}$/i.test(id)) } },
    { name: 1, kind: 1 },
  ).lean<{ _id: Types.ObjectId; name: string; kind: string }[]>();
  const sourceById = new Map(runSources.map((s) => [s._id.toString(), s]));

  let queues: QueueCounts[] = [];
  let queuesError: string | null = null;
  try {
    queues = await ctx.queue.counts();
  } catch (err) {
    queuesError = (err as Error).message;
  }

  let meter: (string | null)[] = [null, null, null, null, null];
  try {
    meter = await withTimeout(
      ctx.redis.mget(
        redisKeys.crawlerBackend,
        redisKeys.crawlerCredits(day),
        redisKeys.crawlerSelfHosted(day),
        redisKeys.crawlerBackendReason,
        redisKeys.crawlerCloudRemaining,
      ),
      1_500,
      'crawler meter',
    );
  } catch {
    /* reported as zeros */
  }
  const num = (v: string | null | undefined) => (v && Number.isFinite(Number(v)) ? Number(v) : 0);

  return {
    generatedAt: now,
    users: { total: users, admins, withPassword, withGoogle, newLast7d: newUsers },
    listings: {
      total: listingTotal,
      active: listingTotal - archived,
      archived,
      byType: countsBy<OpportunityType>(OPPORTUNITY_TYPES, byType),
    },
    sources: {
      total: byScope.reduce((sum, r) => sum + r.n, 0),
      byScope: countsBy(['personal', 'community'] as const, byScope),
      byHealth: countsBy(SOURCE_HEALTH, byHealth),
      byKind: countsBy(SOURCE_KINDS, byKind),
    },
    queues,
    queuesError,
    crawler: {
      date: day,
      backend: meter[0] === 'selfhosted' ? 'selfhosted' : 'cloud',
      cloudUsedToday: num(meter[1]),
      selfHostedUsedToday: num(meter[2]),
      cap: ctx.env.FIRECRAWL_DAILY_CREDIT_CAP,
      backendReason: meter[3] ?? null,
      cloudRemaining: meter[4] ? num(meter[4]) : null,
    },
    recentRuns: runs.map((r) => {
      const source = sourceById.get(String(r.sourceId));
      return {
        id: r._id.toString(),
        sourceId: String(r.sourceId),
        sourceName: source?.name ?? null,
        sourceKind: source?.kind ?? null,
        reason: r.reason ?? null,
        status: r.status ?? null,
        startedAt: r.startedAt ?? null,
        finishedAt: r.finishedAt ?? null,
        durationMs: r.durationMs ?? null,
        found: r.found ?? 0,
        new: r.new ?? 0,
        updated: r.updated ?? 0,
        unchanged: r.unchanged ?? 0,
        errors: (r.errors ?? []).slice(0, 5),
        backend: r.backend ?? null,
        creditsUsed: r.creditsUsed ?? 0,
      };
    }),
  };
}
