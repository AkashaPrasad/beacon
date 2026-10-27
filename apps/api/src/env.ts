import { z } from 'zod';

const booleanish = z.preprocess((value) => {
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value;
}, z.boolean());

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    MONGODB_URI: z.string().optional(),
    MONGODB_DB: z.string().min(1).default('beacon'),
    REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

    // Auth
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters').optional(),
    /** 32-byte AES-256-GCM key as 64 hex characters. */
    ENCRYPTION_KEY: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be 64 hex characters (32 bytes)')
      .optional(),

    // URLs
    WEB_URL: z.url().default('http://localhost:5173'),
    API_URL: z.url().optional(),
    /** Express `trust proxy` hop count (Caddy sends a single X-Forwarded-For hop). */
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),

    // AI (server default provider; users may BYOK)
    LLM_PROVIDER: z.string().optional(),
    LLM_BASE_URL: z.url().optional(),
    LLM_API_KEY: z.string().optional(),
    LLM_MODEL: z.string().optional(),
    LLM_DAILY_USER_CAP: z.coerce.number().int().min(0).default(50),
    LLM_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(30_000),
    /** Reasoning tokens count toward max_tokens (BRIEF), so never go below 4096. */
    LLM_MAX_TOKENS: z.coerce.number().int().min(4_096).default(4_096),

    // Crawling / sources
    FIRECRAWL_DAILY_CREDIT_CAP: z.coerce.number().int().min(0).default(500),
    SEED_SOURCES: booleanish.default(true),

    // Notifications
    VAPID_PUBLIC_KEY: z.string().optional(),

    // Retrieval
    VECTOR_SEARCH: z.enum(['atlas', 'memory']).default('memory'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    for (const key of ['JWT_SECRET', 'ENCRYPTION_KEY', 'GOOGLE_CLIENT_ID', 'MONGODB_URI'] as const) {
      if (!env[key]) {
        ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required in production` });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate process environment. Empty strings are treated as unset so a
 * copied `.env.example` falls back to defaults instead of failing validation.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ''),
  );
  return envSchema.parse(cleaned);
}
