import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateObject, type LanguageModel } from 'ai';
import { z } from 'zod';

import { OPPORTUNITY_TYPES, PAY_PERIODS } from '@kestrel/shared';

import type { CrawlIndexItem } from '../fetchers/types.js';
import type { Logger } from '../logger.js';
import type { RedisLike } from '../redis.js';
import { utcDay } from './dates.js';
import { sleep } from './http.js';

// Every call would otherwise print two expected SDK warnings: `generateObject` is deprecated
// in AI SDK 7 (still supported, and it is the only API with `repairText`), and a JSON schema
// cannot be sent without structured outputs, so `response_format: {type:'json_object'}` is
// used and zod validates. Token usage and failures are logged by `ListingLlm` instead.
(globalThis as { AI_SDK_LOG_WARNINGS?: boolean }).AI_SDK_LOG_WARNINGS = false;

/** What the LLM returns for one listing (zod-validated; every field defaulted). */
export const llmExtractionSchema = z.object({
  skillsRequired: z.array(z.string().max(80)).max(40).catch([]).default([]),
  skillsNice: z.array(z.string().max(80)).max(40).catch([]).default([]),
  eligibility: z
    .object({
      gradYears: z.array(z.number().int().min(2000).max(2100)).max(20).catch([]).default([]),
      degrees: z.array(z.string().max(120)).max(20).catch([]).default([]),
      minExperienceYears: z.number().min(0).max(50).nullable().catch(null).default(null),
      citizenship: z.array(z.string().max(60)).max(30).catch([]).default([]),
      other: z.array(z.string().max(300)).max(20).catch([]).default([]),
    })
    .catch({ gradYears: [], degrees: [], minExperienceYears: null, citizenship: [], other: [] })
    .default({ gradYears: [], degrees: [], minExperienceYears: null, citizenship: [], other: [] }),
  deadline: z.string().max(200).nullable().catch(null).default(null),
  stipend: z
    .object({
      min: z.number().nullable().catch(null),
      max: z.number().nullable().catch(null),
      currency: z.string().max(3).nullable().catch(null),
      period: z.enum(PAY_PERIODS).nullable().catch(null),
    })
    .nullable()
    .catch(null)
    .default(null),
  remote: z.enum(['remote', 'hybrid', 'onsite', 'unknown']).catch('unknown').default('unknown'),
  type: z.enum(OPPORTUNITY_TYPES).nullable().catch(null).default(null),
});
export type LlmExtraction = z.infer<typeof llmExtractionSchema>;

const indexSchema = z.object({
  listings: z
    .array(
      z.object({
        title: z.string().min(1).max(300),
        company: z.string().max(300).nullable().optional(),
        url: z.string().max(2048).nullable().optional(),
        location: z.string().max(300).nullable().optional(),
        remote: z.boolean().nullable().optional(),
        type: z.string().max(40).nullable().optional(),
        deadline: z.string().max(200).nullable().optional(),
        stipend: z.string().max(200).nullable().optional(),
        summary: z.string().max(1000).nullable().optional(),
      }),
    )
    .max(100)
    .catch([]),
});

const EXTRACT_SYSTEM = `You extract structured facts from an opportunity posting (job, internship, hackathon, scholarship, fellowship, research or open-source program).
Reply with ONE JSON object and nothing else, exactly this shape:
{"skillsRequired": string[], "skillsNice": string[],
 "eligibility": {"gradYears": number[], "degrees": string[], "minExperienceYears": number|null, "citizenship": string[] (ISO alpha-2), "other": string[]},
 "deadline": string|null (as written), "stipend": {"min": number|null, "max": number|null, "currency": "INR"|"USD"|..., "period": "hour"|"day"|"week"|"month"|"year"|"total"}|null,
 "remote": "remote"|"hybrid"|"onsite"|"unknown",
 "type": "internship"|"fulltime"|"hackathon"|"scholarship"|"fellowship"|"research"|"opensource"|null}
Only include facts stated in the text. Skills are short canonical names ("React", "Python", "SQL"). Empty arrays / null when not stated.`;

const INDEX_SYSTEM = `You read the Markdown of a careers/opportunities page and list every open opportunity on it.
Reply with ONE JSON object and nothing else: {"listings": [{"title": string, "company": string|null, "url": string|null (absolute), "location": string|null, "remote": boolean|null, "type": string|null, "deadline": string|null, "stipend": string|null, "summary": string|null}]}
Skip navigation links, blog posts and closed or past items. Return {"listings": []} when there are none.`;

/** Strip ```json fences / prose around the object (reasoning models sometimes add them). */
export function repairJsonText(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced?.[1] ?? text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start >= 0 && end > start ? body.slice(start, end + 1) : body.trim();
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/** Thrown before a call when today's per-user (or server-wide) LLM budget is spent. */
export class LlmCapError extends Error {
  override readonly name = 'LlmCapError';
}

/** Who a call is attributed to: the owner of a personal source, else the server budget. */
export interface LlmCallContext {
  userId?: string | null;
}

/** Redis key names shared with the API (API.md §14). Server-side work uses the id `server`. */
export const LLM_KEYS = {
  calls: (subject: string, day: string) => `llm:calls:${subject}:${day}`,
  tokens: (subject: string, day: string) => `llm:tokens:${subject}:${day}`,
};

export interface ListingLlmOptions {
  model: LanguageModel;
  modelId: string;
  logger: Logger;
  redis?: RedisLike | null;
  maxTokens?: number;
  timeoutMs?: number;
  retries?: number;
  /** USD per 1M tokens, for the cost log (server default model: 0). */
  costPerMTokIn?: number;
  costPerMTokOut?: number;
  /** Daily call caps; 0 disables that kind of call. Unset = unlimited. */
  userDailyCap?: number;
  serverDailyCap?: number;
  now?: () => Date;
}

const CACHE_TTL_SECONDS = 30 * 24 * 3600;

/**
 * Server-side structured extraction (Vercel AI SDK `generateObject`, JSON mode). Every
 * call: max_tokens ≥ 4096 (reasoning tokens count), 30 s timeout, 2 retries with
 * backoff, tokens + cost logged; results cached in Redis by content hash.
 */
export class ListingLlm {
  private readonly maxTokens: number;
  private readonly timeoutMs: number;
  private readonly retries: number;
  readonly modelId: string;

  constructor(private readonly opts: ListingLlmOptions) {
    this.maxTokens = Math.max(4_096, opts.maxTokens ?? 4_096);
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.retries = opts.retries ?? 2;
    this.modelId = opts.modelId;
  }

  /** INCR `llm:calls:<subject>:<day>` and refuse above the cap (Redis errors allow the call). */
  private async takeSlot(ctx: LlmCallContext): Promise<string> {
    const subject = ctx.userId ?? 'server';
    const cap = ctx.userId ? this.opts.userDailyCap : this.opts.serverDailyCap;
    const redis = this.opts.redis;
    if (cap === undefined || !redis) return subject;
    if (cap <= 0) throw new LlmCapError(`LLM calls are disabled for ${subject}`);
    try {
      const key = LLM_KEYS.calls(subject, utcDay(this.opts.now?.() ?? new Date()));
      const count = await redis.incrby(key, 1);
      if (count === 1) await redis.expire(key, 2 * 86_400);
      if (count > cap) throw new LlmCapError(`Daily LLM cap (${cap}) reached for ${subject}`);
    } catch (err) {
      if (err instanceof LlmCapError) throw err;
      this.opts.logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'llm cap check failed; allowing call');
    }
    return subject;
  }

  /** Token counters in the same hash the API writes (`prompt`, `completion`, `total`). */
  private async recordUsage(subject: string, usage: LlmUsage): Promise<void> {
    const redis = this.opts.redis;
    if (!redis) return;
    try {
      const key = LLM_KEYS.tokens(subject, utcDay(this.opts.now?.() ?? new Date()));
      await redis.hincrby(key, 'prompt', usage.inputTokens);
      await redis.hincrby(key, 'completion', usage.outputTokens);
      await redis.hincrby(key, 'total', usage.inputTokens + usage.outputTokens);
      await redis.expire(key, 7 * 86_400);
    } catch {
      /* usage counters are best effort */
    }
  }

  private async call<T>(schema: z.ZodType<T>, system: string, prompt: string, tag: string, ctx: LlmCallContext = {}): Promise<{ object: T; usage: LlmUsage }> {
    const subject = await this.takeSlot(ctx);
    const result = await this.callModel(schema, system, prompt, tag, subject);
    await this.recordUsage(subject, result.usage);
    return result;
  }

  private async callModel<T>(schema: z.ZodType<T>, system: string, prompt: string, tag: string, subject: string): Promise<{ object: T; usage: LlmUsage }> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (attempt > 0) await sleep(1_000 * 2 ** (attempt - 1));
      const started = Date.now();
      try {
        const result = await generateObject({
          model: this.opts.model,
          schema,
          system,
          prompt,
          maxOutputTokens: this.maxTokens,
          temperature: 0,
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(this.timeoutMs),
          repairText: ({ text }) => Promise.resolve(repairJsonText(text)),
        });
        const inputTokens = result.usage.inputTokens ?? 0;
        const outputTokens = result.usage.outputTokens ?? 0;
        const costUsd = (inputTokens * (this.opts.costPerMTokIn ?? 0) + outputTokens * (this.opts.costPerMTokOut ?? 0)) / 1e6;
        this.opts.logger.info({ llm: tag, model: this.modelId, subject, inputTokens, outputTokens, costUsd, ms: Date.now() - started, attempt }, 'llm call');
        return { object: result.object as T, usage: { inputTokens, outputTokens, costUsd } };
      } catch (err) {
        lastError = err;
        this.opts.logger.warn({ llm: tag, attempt, err: err instanceof Error ? err.message : String(err) }, 'llm call failed');
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  /** Cached by content hash: a cache hit costs no call and no budget. */
  async extractListing(
    input: { title: string; company: string; descriptionMd: string; contentHash: string },
    ctx: LlmCallContext = {},
  ): Promise<LlmExtraction> {
    const cacheKey = `llm:extract:${input.contentHash}`;
    const cached = await this.opts.redis?.get(cacheKey);
    if (cached) return llmExtractionSchema.parse(JSON.parse(cached));
    const prompt = `Title: ${input.title}\nOrganisation: ${input.company}\n\n${input.descriptionMd.slice(0, 12_000)}`;
    const { object } = await this.call(llmExtractionSchema, EXTRACT_SYSTEM, prompt, 'extract', ctx);
    await this.opts.redis?.set(cacheKey, JSON.stringify(object), 'EX', CACHE_TTL_SECONDS);
    return object;
  }

  async extractIndex(markdown: string, pageUrl: string, ctx: LlmCallContext = {}): Promise<CrawlIndexItem[]> {
    const { object } = await this.call(indexSchema, INDEX_SYSTEM, `Page: ${pageUrl}\n\n${markdown.slice(0, 40_000)}`, 'index', ctx);
    return object.listings;
  }
}

export function createServerLlm(env: {
  LLM_BASE_URL?: string;
  LLM_API_KEY?: string;
  LLM_MODEL?: string;
  LLM_MAX_TOKENS: number;
  LLM_TIMEOUT_MS: number;
  LLM_DISABLED: boolean;
  LLM_DAILY_USER_CAP?: number;
  LLM_DAILY_SERVER_CAP?: number;
}, logger: Logger, redis: RedisLike | null): ListingLlm | null {
  if (env.LLM_DISABLED || !env.LLM_BASE_URL || !env.LLM_API_KEY || !env.LLM_MODEL) return null;
  const provider = createOpenAICompatible({ name: 'server', baseURL: env.LLM_BASE_URL, apiKey: env.LLM_API_KEY, includeUsage: true });
  return new ListingLlm({
    model: provider.chatModel(env.LLM_MODEL),
    modelId: env.LLM_MODEL,
    logger,
    redis,
    maxTokens: env.LLM_MAX_TOKENS,
    timeoutMs: env.LLM_TIMEOUT_MS,
    ...(env.LLM_DAILY_USER_CAP !== undefined ? { userDailyCap: env.LLM_DAILY_USER_CAP } : {}),
    ...(env.LLM_DAILY_SERVER_CAP !== undefined ? { serverDailyCap: env.LLM_DAILY_SERVER_CAP } : {}),
  });
}
