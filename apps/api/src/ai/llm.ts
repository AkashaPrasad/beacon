/**
 * LLM access (Vercel AI SDK + OpenAI-compatible provider). Server default from `LLM_*` env,
 * per-user BYOK override from settings. Every call: zod-validated structured output,
 * per-attempt timeout, 2 retries with backoff, per-user daily cap in Redis, token usage
 * logged. Callers always get a result object, never an exception, so AI failures degrade
 * to the deterministic path.
 */
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateObject, generateText, type LanguageModelUsage } from 'ai';
import type { Types } from 'mongoose';
import type { z } from 'zod';

import type { AiProvider } from '@kestrel/shared';

import type { AppContext } from '../context.js';
import { aiKeyAad, decryptSecret } from '../lib/crypto.js';
import { redisKeys, utcDay, withTimeout } from '../lib/redis.js';
import type { SettingsDoc } from '../models/settings.js';
import { getSettings } from '../services/settings.js';

// The SDK's console warnings (deprecations, unsupported json_schema) bypass pino; keep logs clean.
(globalThis as { AI_SDK_LOG_WARNINGS?: boolean }).AI_SDK_LOG_WARNINGS = false;

export interface LlmConfig {
  provider: AiProvider | 'server';
  baseURL: string;
  apiKey: string | null;
  model: string;
  source: 'server' | 'byok';
}

export type LlmPurpose = 'resume' | 'explain' | 'test';

export type LlmUnavailableReason =
  | 'disabled'
  | 'no_consent'
  | 'not_configured'
  | 'cap_reached'
  | 'key_unreadable';

export const PROVIDER_BASE_URLS: Partial<Record<AiProvider, string>> = {
  openai: 'https://api.openai.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  openrouter: 'https://openrouter.ai/api/v1',
  ollama: 'http://localhost:11434/v1',
};

export const PROVIDER_DEFAULT_MODELS: Partial<Record<AiProvider, string>> = {
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
  openrouter: 'openrouter/auto',
  ollama: 'llama3.1',
};

/** Strip ```json fences and leading prose so `JSON.parse` sees only the object. */
export function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const body = fenced?.[1] ?? trimmed;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

export function serverConfig(ctx: AppContext): LlmConfig | null {
  const { LLM_BASE_URL, LLM_MODEL, LLM_API_KEY } = ctx.env;
  if (!LLM_BASE_URL || !LLM_MODEL) return null;
  return {
    provider: 'server',
    baseURL: LLM_BASE_URL,
    apiKey: LLM_API_KEY ?? null,
    model: LLM_MODEL,
    source: 'server',
  };
}

/** Build a BYOK config from stored settings (decrypting the key). */
export function byokConfig(
  ctx: AppContext,
  userId: string,
  ai: Pick<SettingsDoc['ai'], 'provider' | 'baseUrl' | 'model' | 'keyCiphertext'>,
): LlmConfig | 'key_unreadable' | null {
  if (ai.provider === 'default') return null;
  const baseURL = ai.baseUrl ?? PROVIDER_BASE_URLS[ai.provider];
  const model = ai.model ?? PROVIDER_DEFAULT_MODELS[ai.provider];
  if (!baseURL || !model) return null;
  let apiKey: string | null = null;
  if (ai.keyCiphertext) {
    try {
      apiKey = decryptSecret(ai.keyCiphertext, ctx.encryptionKey, aiKeyAad(userId));
    } catch {
      return 'key_unreadable';
    }
  } else if (ai.provider !== 'ollama' && ai.provider !== 'custom') {
    return null;
  }
  return { provider: ai.provider, baseURL, apiKey, model, source: 'byok' };
}

export type ResolvedLlm =
  | { ok: true; config: LlmConfig }
  | { ok: false; reason: LlmUnavailableReason };

/**
 * Decide whether AI may run for this user and purpose. AI off → disabled. The server default
 * needs recorded consent; resume parsing additionally needs `privacy.sendResumeToAi`.
 */
export function resolveLlm(
  ctx: AppContext,
  userId: string,
  settings: SettingsDoc,
  purpose: LlmPurpose,
): ResolvedLlm {
  if (!settings.ai?.enabled) return { ok: false, reason: 'disabled' };
  if (purpose === 'resume' && !settings.privacy?.sendResumeToAi) return { ok: false, reason: 'no_consent' };
  if (settings.ai.provider !== 'default') {
    const config = byokConfig(ctx, userId, settings.ai);
    if (config === 'key_unreadable') return { ok: false, reason: 'key_unreadable' };
    if (!config) return { ok: false, reason: 'not_configured' };
    return { ok: true, config };
  }
  if (!settings.ai.consentGivenAt) return { ok: false, reason: 'no_consent' };
  const config = serverConfig(ctx);
  return config ? { ok: true, config } : { ok: false, reason: 'not_configured' };
}

/** Increment and check the user's daily call counter. Redis errors allow the call. */
async function takeDailySlot(ctx: AppContext, userId: string): Promise<boolean> {
  const cap = ctx.env.LLM_DAILY_USER_CAP;
  if (cap <= 0) return false;
  try {
    const key = redisKeys.llmCalls(userId, utcDay(ctx.now()));
    const count = await withTimeout(ctx.redis.incr(key), 1_000, 'llm cap');
    if (count === 1) await withTimeout(ctx.redis.expire(key, 2 * 86_400), 1_000, 'llm cap ttl');
    return count <= cap;
  } catch (err) {
    ctx.logger.warn({ err: (err as Error).message }, 'llm cap check failed; allowing call');
    return true;
  }
}

async function recordUsage(
  ctx: AppContext,
  userId: string,
  purpose: LlmPurpose,
  config: LlmConfig,
  usage: LanguageModelUsage | undefined,
  latencyMs: number,
): Promise<void> {
  const prompt = usage?.inputTokens ?? 0;
  const completion = usage?.outputTokens ?? 0;
  const total = usage?.totalTokens ?? prompt + completion;
  ctx.logger.info(
    { userId, purpose, model: config.model, source: config.source, prompt, completion, total, latencyMs },
    'llm usage',
  );
  try {
    const key = redisKeys.llmTokens(userId, utcDay(ctx.now()));
    await withTimeout(
      Promise.all([
        ctx.redis.hincrby(key, 'prompt', prompt),
        ctx.redis.hincrby(key, 'completion', completion),
        ctx.redis.hincrby(key, 'total', total),
        ctx.redis.expire(key, 7 * 86_400),
      ]),
      1_000,
      'llm usage',
    );
  } catch {
    /* usage counters are best effort */
  }
}

function modelFor(config: LlmConfig) {
  const provider = createOpenAICompatible({
    name: config.source === 'server' ? 'server' : config.provider,
    baseURL: config.baseURL,
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    supportsStructuredOutputs: false,
  });
  return provider.chatModel(config.model);
}

function isRetryable(err: unknown): boolean {
  const e = err as { statusCode?: number; isRetryable?: boolean; name?: string };
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return true;
  if (typeof e?.statusCode === 'number') return e.statusCode === 429 || e.statusCode >= 500;
  if (typeof e?.isRetryable === 'boolean') return e.isRetryable;
  return true;
}

function describeError(err: unknown): string {
  const e = err as { statusCode?: number; message?: string; name?: string };
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return 'The AI provider timed out';
  if (typeof e?.statusCode === 'number') return `The AI provider returned HTTP ${e.statusCode}`;
  return (e?.message ?? 'AI call failed').slice(0, 200);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetries<T>(ctx: AppContext, attempt: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const delays = ctx.llmRetryDelaysMs;
  for (let i = 0; ; i += 1) {
    try {
      return await attempt(AbortSignal.timeout(ctx.env.LLM_TIMEOUT_MS));
    } catch (err) {
      if (i >= delays.length || !isRetryable(err)) throw err;
      await sleep(delays[i] ?? 0);
    }
  }
}

export type LlmResult<T> =
  | { ok: true; object: T; config: LlmConfig; usage: LanguageModelUsage | undefined }
  | { ok: false; reason: LlmUnavailableReason | 'error'; message: string };

export interface GenerateStructuredInput<S extends z.ZodType> {
  userId: string;
  purpose: Exclude<LlmPurpose, 'test'>;
  schema: S;
  schemaName: string;
  system: string;
  prompt: string;
  config: LlmConfig;
}

export async function generateStructured<S extends z.ZodType>(
  ctx: AppContext,
  input: GenerateStructuredInput<S>,
): Promise<LlmResult<z.output<S>>> {
  const { userId, purpose, schema, schemaName, system, prompt, config } = input;
  if (!(await takeDailySlot(ctx, userId))) {
    return { ok: false, reason: 'cap_reached', message: 'Daily AI limit reached' };
  }
  const started = Date.now();
  try {
    const result = await withRetries(ctx, (abortSignal) =>
      generateObject({
        model: modelFor(config),
        schema,
        schemaName,
        system,
        prompt,
        maxOutputTokens: ctx.env.LLM_MAX_TOKENS,
        maxRetries: 0,
        abortSignal,
        repairText: ({ text }) => Promise.resolve(stripCodeFences(text)),
      }),
    );
    await recordUsage(ctx, userId, purpose, config, result.usage, Date.now() - started);
    return { ok: true, object: result.object as z.output<S>, config, usage: result.usage };
  } catch (err) {
    ctx.logger.warn({ userId, purpose, model: config.model, err: describeError(err) }, 'llm call failed');
    return { ok: false, reason: 'error', message: describeError(err) };
  }
}

/** One-token completion to check provider, key and model. */
export async function testLlm(
  ctx: AppContext,
  config: LlmConfig,
): Promise<{ ok: true; latencyMs: number } | { ok: false; latencyMs: number; error: string }> {
  const started = Date.now();
  try {
    await generateText({
      model: modelFor(config),
      prompt: 'Reply with OK.',
      maxOutputTokens: 1,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(Math.min(ctx.env.LLM_TIMEOUT_MS, 20_000)),
    });
    return { ok: true, latencyMs: Date.now() - started };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - started, error: describeError(err) };
  }
}

/** Convenience: load settings and resolve the LLM for a purpose. */
export async function llmForUser(
  ctx: AppContext,
  userId: Types.ObjectId,
  purpose: LlmPurpose,
): Promise<{ settings: SettingsDoc; resolved: ResolvedLlm }> {
  const settings = await getSettings(userId);
  return { settings, resolved: resolveLlm(ctx, userId.toString(), settings, purpose) };
}

export const LLM_REASON_MESSAGES: Record<LlmUnavailableReason | 'error', string> = {
  disabled: 'AI is turned off in Settings',
  no_consent: 'AI consent has not been given',
  not_configured: 'No AI provider is configured',
  cap_reached: 'Daily AI limit reached',
  key_unreadable: 'Your saved API key could not be decrypted; please re-enter it',
  error: 'The AI provider failed',
};
