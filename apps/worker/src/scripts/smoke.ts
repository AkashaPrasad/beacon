/**
 * Real end-to-end smoke (docs/WORKER.md §Smoke). Ingests ONE Greenhouse and ONE Devpost
 * source from seed/source-packs.json through the real queues (ingest → extract → embed →
 * match) for the fixture profile `usr_aarav`, then prints what landed in Mongo.
 *
 *   set -a; source secrets.env; set +a; \
 *   VECTOR_SEARCH=memory MONGODB_DB=beacon_dev REDIS_URL=redis://localhost:6379 \
 *   QUEUE_PREFIX=beacon-smoke WORKER_SCHEDULER=false HEALTH_PORT=0 \
 *   pnpm --filter @kestrel/worker exec tsx src/scripts/smoke.ts [--board groww] [--llm] [--firecrawl https://example.com] [--keep]
 *
 * --llm        one live structured extraction with the server LLM (cache bypassed)
 * --firecrawl  one Firecrawl cloud scrape of that page (1 credit) + the credit balance
 * --keep       keep the smoke profile and its matches (default: removed at the end)
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import type { Job, Queue } from 'bullmq';
import { Types } from 'mongoose';

import { contentHash, tryNormaliseUrl } from '@kestrel/shared';
import { sampleProfiles } from '@kestrel/shared/fixtures';

import { buildWorker } from '../app.js';
import { loadEnv } from '../env.js';
import { createLogger } from '../logger.js';
import { ListingModel, MatchModel, ProfileModel, SourceModel, SourceRunModel } from '../models/index.js';
import { embedUser } from '../pipelines/embed.js';
import { matchUser } from '../pipelines/match.js';
import { QUEUE_NAMES } from '../queues.js';

interface SeedSource {
  name: string;
  url: string;
  kind: string;
  boardToken?: string;
  apiUrl?: string;
  method?: string;
  apiMethod?: string;
  body?: unknown;
  apiBody?: unknown;
  headers?: Record<string, string>;
  companyDomain?: string;
  country?: string;
  types?: string[];
}

const SMOKE_USER = new Types.ObjectId('beac00000000000000005e01');
const { values: args } = parseArgs({
  options: {
    board: { type: 'string', default: 'groww' },
    llm: { type: 'boolean', default: false },
    firecrawl: { type: 'string' },
    keep: { type: 'boolean', default: false },
  },
});

const ms = (from: number) => `${((performance.now() - from) / 1000).toFixed(1)} s`;

function seedSources(): SeedSource[] {
  const file = new URL('../../../../seed/source-packs.json', import.meta.url);
  const packs = (JSON.parse(readFileSync(file, 'utf8')) as { packs: { sources: SeedSource[] }[] }).packs;
  return packs.flatMap((p) => p.sources);
}

/** Same document shape and identity (`seedKey`) as the API's seed loader, insert-only. */
async function upsertSource(seed: SeedSource): Promise<Types.ObjectId> {
  const seedKey = tryNormaliseUrl(seed.url) ?? seed.url.trim().toLowerCase();
  const method = (seed.apiMethod ?? seed.method)?.toUpperCase();
  const provider = seed.kind === 'publicapi' && seed.apiUrl ? (new URL(seed.apiUrl).hostname.replace(/^(www|api)\./, '').split('.')[0] ?? null) : null;
  await SourceModel.collection.updateOne(
    { seedKey },
    {
      $setOnInsert: {
        url: seedKey,
        name: seed.name,
        kind: seed.kind,
        scope: 'community',
        ownerId: null,
        packId: null,
        packIds: [],
        typeTag: seed.types?.length === 1 ? seed.types[0] : null,
        enabled: true,
        refreshInterval: 'daily',
        health: 'pending',
        lastCheckedAt: null,
        listingsFound: 0,
        errorReason: null,
        config: {
          boardToken: seed.boardToken ?? null,
          feedUrl: seed.apiUrl ?? null,
          provider,
          apiUrl: seed.apiUrl ?? null,
          method: method === 'POST' || method === 'GET' ? method : null,
          body: seed.apiBody ?? seed.body ?? null,
          headers: seed.headers ?? null,
        },
        etag: null,
        lastModified: null,
        companyDomain: seed.companyDomain ?? null,
        country: seed.country && /^[A-Z]{2}$/.test(seed.country) ? seed.country : null,
        tags: [],
        seedKey,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
    { upsert: true },
  );
  const doc = await SourceModel.collection.findOne({ seedKey }, { projection: { _id: 1 } });
  if (!doc) throw new Error(`source ${seed.name} not stored`);
  return doc._id;
}

async function idle(queues: Queue[], timeoutMs: number): Promise<void> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const counts = await Promise.all(queues.map((q) => q.getJobCounts('waiting', 'active', 'delayed', 'waiting-children', 'prioritized')));
    if (counts.every((c) => Object.values(c).every((n) => n === 0))) return;
    if (Date.now() > until) throw new Error(`queues still busy: ${JSON.stringify(counts)}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

function span(jobs: Job[]): string {
  const done = jobs.filter((j) => j.processedOn && j.finishedOn);
  if (!done.length) return 'none';
  const start = Math.min(...done.map((j) => j.processedOn!));
  const end = Math.max(...done.map((j) => j.finishedOn!));
  const busy = done.reduce((sum, j) => sum + (j.finishedOn! - j.processedOn!), 0);
  return `${done.length} jobs, wall ${((end - start) / 1000).toFixed(1)} s, busy ${(busy / 1000).toFixed(1)} s`;
}

async function main(): Promise<void> {
  const env = loadEnv();
  if (env.MONGODB_DB === 'beacon') throw new Error('refusing to smoke against the production database; set MONGODB_DB=beacon_dev');
  // The smoke obliterates its queues at the end: never on the shared default prefix.
  if (!env.QUEUE_PREFIX || env.QUEUE_PREFIX === 'bull') throw new Error('set QUEUE_PREFIX (e.g. beacon-smoke) so the smoke uses its own queues');
  const logger = createLogger(process.env.LOG_LEVEL ?? 'warn');
  const app = buildWorker(env, logger);
  const t0 = performance.now();
  await app.start();
  console.log(`worker up (db ${env.MONGODB_DB}, vector ${env.VECTOR_SEARCH}, prefix ${env.QUEUE_PREFIX ?? 'bull'}) in ${ms(t0)}`);

  try {
    // ── sources ──
    const seeds = seedSources();
    const gh = seeds.find((s) => s.kind === 'greenhouse' && s.boardToken === args.board);
    const dp = seeds.find((s) => s.name === 'Devpost Hackathons');
    if (!gh || !dp) throw new Error(`seed sources not found (board ${args.board})`);
    const ghId = await upsertSource(gh);
    const dpId = await upsertSource(dp);
    console.log(`sources: ${gh.name} (greenhouse ${gh.boardToken ?? '?'}) = ${String(ghId)}, ${dp.name} (publicapi) = ${String(dpId)}`);

    // ── fixture profile (usr_aarav) + its embedding ──
    const { userId: _fixtureId, embeddingHash: _h, ...fixture } = sampleProfiles[0]!;
    await ProfileModel.collection.updateOne(
      { userId: SMOKE_USER },
      { $set: { ...fixture, userId: SMOKE_USER, profileHash: contentHash(JSON.stringify(fixture)), embeddingHash: null, embedding: [] } },
      { upsert: true },
    );
    const tEmbed = performance.now();
    await embedUser(app.deps, String(SMOKE_USER));
    console.log(`profile embedded (first call loads the model) in ${ms(tEmbed)}`);

    // ── ingest both through the real queues ──
    const tIngest = performance.now();
    for (const sourceId of [ghId, dpId]) await app.set.add(QUEUE_NAMES.ingest, { sourceId: String(sourceId), reason: 'manual' });
    const pipeline = [QUEUE_NAMES.ingest, QUEUE_NAMES.extract, QUEUE_NAMES.embed, QUEUE_NAMES.match].map((n) => app.set.queues.get(n)!);
    await idle(pipeline, 10 * 60_000);
    console.log(`ingest → extract → embed → match drained in ${ms(tIngest)}`);
    const [ingestJobs, extractJobs, embedJobs, matchJobs] = await Promise.all(pipeline.map((q) => q.getJobs(['completed', 'failed'])));
    console.log(`  ingest:  ${span(ingestJobs!)}`);
    for (const j of ingestJobs!) console.log(`    ${JSON.stringify(j.returnvalue ?? j.failedReason)}`.slice(0, 300));
    console.log(`  extract: ${span(extractJobs!)}`);
    console.log(`  embed:   ${span(embedJobs!)}`);
    console.log(`  match:   ${span(matchJobs!)}`);
    const failed = (await Promise.all(pipeline.map((q) => q.getJobs(['failed'])))).flat();
    if (failed.length) console.log(`  FAILED: ${failed.map((j) => `${j.queueName}:${j.failedReason}`).join(' | ').slice(0, 500)}`);

    // ── what landed ──
    for (const [name, id] of [[gh.name, ghId], [dp.name, dpId]] as const) {
      const total = await ListingModel.countDocuments({ sourceIds: id });
      const embedded = await ListingModel.countDocuments({ sourceIds: id, 'embedding.383': { $exists: true } });
      const extracted = await ListingModel.countDocuments({ sourceIds: id, $expr: { $eq: ['$extractedHash', '$contentHash'] } });
      const src = await SourceModel.findById(id).lean();
      const run = await SourceRunModel.findOne({ sourceId: id }).sort({ startedAt: -1 }).lean();
      console.log(`${name}: ${total} listings, ${embedded} with 384-d embeddings, ${extracted} extracted; source health=${src?.health ?? '?'}/${src?.healthCode ?? '-'} found=${src?.listingsFound ?? 0}; last run ${run?.status ?? '?'} in ${run?.durationMs ?? '?'} ms`);
    }
    const sampleListing = await ListingModel.findOne({ sourceIds: dpId }, { embedding: 0, descriptionMd: 0 }).lean();
    if (sampleListing) console.log(`  e.g. ${sampleListing.type} "${sampleListing.title}" deadline=${sampleListing.deadlineAt?.toISOString() ?? sampleListing.deadlineKind} skills=${sampleListing.skillsRequired.slice(0, 5).join(', ')}`);

    // ── full recompute for the fixture profile ──
    const tMatch = performance.now();
    const outcome = await matchUser(app.deps, String(SMOKE_USER));
    console.log(`matchUser: ${JSON.stringify(outcome)} in ${ms(tMatch)}`);
    const top = await MatchModel.find({ userId: SMOKE_USER }).sort({ score: -1 }).limit(5).lean();
    const titles = new Map((await ListingModel.find({ _id: { $in: top.map((m) => m.listingId) } }, { title: 1, company: 1, type: 1 }).lean()).map((l) => [String(l._id), l]));
    for (const m of top) {
      const l = titles.get(String(m.listingId));
      console.log(`  ${String(m.score).padStart(3)}  ${l?.type ?? '?'}  ${l?.title ?? '?'} · ${l?.company ?? '?'}  (semantic ${m.semantic?.toFixed(3) ?? 'n/a'}; ${m.explain?.whyFit?.[0] ?? ''})`);
    }

    // ── optional: one live LLM extraction ──
    if (args.llm) {
      const l = await ListingModel.findOne({ sourceIds: ghId, descriptionMd: { $ne: '' } }).lean();
      if (!app.deps.llm || !l) console.log('llm: not configured or no listing');
      else {
        const tLlm = performance.now();
        const out = await app.deps.llm.extractListing({ title: l.title, company: l.company, descriptionMd: l.descriptionMd, contentHash: `smoke-${Date.now()}` });
        console.log(`llm extract (${ms(tLlm)}): skillsRequired=${out.skillsRequired.slice(0, 8).join(', ')} | type=${out.type ?? 'null'} remote=${out.remote} gradYears=${out.eligibility.gradYears.join(',')}`);
      }
    }

    // ── optional: one Firecrawl cloud scrape ──
    if (args.firecrawl) {
      const before = await app.crawler.checkCloudBalance(true);
      const tScrape = performance.now();
      const res = await app.crawler.scrape(args.firecrawl, { formats: ['markdown'] });
      const usage = await app.meter.usage();
      console.log(
        `firecrawl: backend=${res.backend} creditsUsed=${res.creditsUsed} markdown=${res.data.markdown?.length ?? 0} chars title="${res.data.metadata?.title ?? ''}" in ${ms(tScrape)}; ` +
          `remainingCredits before=${before ?? 'n/a'}; meter today=${usage.cloudCreditsUsed}/${usage.dailyCap}`,
      );
    }
  } finally {
    if (!args.keep) {
      await MatchModel.deleteMany({ userId: SMOKE_USER });
      await ProfileModel.deleteOne({ userId: SMOKE_USER });
    }
    await Promise.allSettled([...app.set.queues.values(), app.set.dead, app.set.maintenance].map((q) => q.obliterate({ force: true })));
    await app.stop();
  }
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
