import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HEALTH_PORT: z.coerce.number().int().min(0).max(65_535).default(4001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  /** BullMQ key prefix (default `bull`). Producers (the API) must use the same one. */
  QUEUE_PREFIX: z.string().min(1).optional(),

  // ── Database ──
  MONGODB_URI: z.string().optional(),
  MONGODB_DB: z.string().min(1).default('beacon'),
  /** `atlas` = $vectorSearch on listings.embedding; `memory` = in-process cosine scan. */
  VECTOR_SEARCH: z.enum(['atlas', 'memory']).default('memory'),
  VECTOR_INDEX_NAME: z.string().min(1).default('listings_embedding'),

  // ── Worker behaviour ──
  /** Set to false to run only the producer side (e.g. smoke scripts). */
  WORKER_PROCESSORS: bool.default(true),
  /** Register repeatable jobs on boot. */
  WORKER_SCHEDULER: bool.default(true),
  /** Max listings kept per source run (size cap against runaway boards). */
  INGEST_MAX_LISTINGS: z.coerce.number().int().min(1).default(1_000),
  /** Max users scored per incremental match job (chunked beyond this). */
  MATCH_USERS_PER_JOB: z.coerce.number().int().min(1).default(200),
  MATCH_CANDIDATES_K: z.coerce.number().int().min(1).max(2_000).default(200),

  // ── AI (server default) ──
  LLM_PROVIDER: z.string().default('openai-compatible'),
  LLM_BASE_URL: z.string().url().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().optional(),
  LLM_MAX_TOKENS: z.coerce.number().int().min(4_096).default(4_096),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(30_000),
  /** Disable server-side LLM extraction entirely (rules only). */
  LLM_DISABLED: bool.default(false),
  /** Per-user daily LLM calls (`llm:calls:<userId>:<day>`, shared with the API). */
  LLM_DAILY_USER_CAP: z.coerce.number().int().min(0).default(50),
  /** Server-wide daily extraction calls for community listings (`llm:calls:server:<day>`). */
  LLM_DAILY_SERVER_CAP: z.coerce.number().int().min(0).default(1_000),
  EMBEDDING_PROVIDER: z.enum(['local', 'openai']).default('local'),
  EMBEDDING_MODEL: z.string().default('Xenova/bge-small-en-v1.5'),
  OPENAI_API_KEY: z.string().optional(),
  /** transformers.js model cache directory. */
  HF_HOME: z.string().default('/tmp/hf-cache'),

  // ── Crawling ──
  FIRECRAWL_API_KEY: z.string().optional(),
  FIRECRAWL_API_URL: z.string().url().default('https://api.firecrawl.dev'),
  /** Same default as the API's credit meter (`GET /v1/sources/credits`). */
  FIRECRAWL_DAILY_CREDIT_CAP: z.coerce.number().int().min(0).default(500),
  FIRECRAWL_USER_DAILY_CREDIT_CAP: z.coerce.number().int().min(0).default(30),
  FIRECRAWL_SELF_HOSTED_URL: z.string().url().optional(),
  FIRECRAWL_INSTANCE_ID: z.string().optional(),
  FIRECRAWL_STANDBY_IDLE_MINUTES: z.coerce.number().int().min(1).default(20),
  FIRECRAWL_MAX_DETAIL_PAGES: z.coerce.number().int().min(0).max(50).default(20),
  AWS_REGION: z.string().default('ap-south-1'),

  // ── Public APIs with keys ──
  ADZUNA_APP_ID: z.string().optional(),
  ADZUNA_APP_KEY: z.string().optional(),

  // ── Web push ──
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  /** Max pushes per user per day; overflow stays in-app (USERFLOW §3.4). */
  PUSH_DAILY_CAP: z.coerce.number().int().min(0).default(10),
  WEB_URL: z.string().default('https://beacon.spacesdrive.cc'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ''),
  );
  return envSchema.parse(cleaned);
}
