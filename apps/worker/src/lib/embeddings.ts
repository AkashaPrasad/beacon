import { contentHash, EMBEDDING_DIM } from '@kestrel/shared';

import type { Logger } from '../logger.js';
import { nullLogger } from '../logger.js';

export interface Embedder {
  readonly model: string;
  readonly dim: number;
  /** One L2-normalised vector per input text. */
  embed(texts: readonly string[]): Promise<number[][]>;
}

export const EMBED_BATCH = 16;
const DESCRIPTION_CHARS = 1_500;

/** Listing text: title + company + type + skills + first 1500 chars of the description. */
export function listingEmbeddingText(l: {
  title: string;
  company: string;
  type: string;
  skillsRequired?: readonly string[];
  skillsNice?: readonly string[];
  descriptionMd?: string;
}): string {
  const skills = [...(l.skillsRequired ?? []), ...(l.skillsNice ?? [])];
  return [
    l.title,
    l.company,
    l.type,
    skills.length ? `Skills: ${skills.join(', ')}` : '',
    (l.descriptionMd ?? '').replace(/[#*_>`[\]()]/g, ' ').replace(/\s+/g, ' ').slice(0, DESCRIPTION_CHARS),
  ]
    .filter(Boolean)
    .join('\n');
}

/** Profile text: roles + skills + education + projects summary (+ headline/summary). */
export function profileEmbeddingText(p: {
  headline?: string | null;
  summary?: string | null;
  preferredRoles?: readonly string[];
  skills?: readonly { name: string }[];
  education?: readonly { degree?: string; field?: string | null; institution?: string; gradYear?: number }[];
  projects?: readonly { name: string; description?: string | null; skills?: readonly string[] }[];
  opportunityTypes?: readonly string[];
}): string {
  const lines = [
    p.headline ?? '',
    p.preferredRoles?.length ? `Roles: ${p.preferredRoles.join(', ')}` : '',
    p.opportunityTypes?.length ? `Looking for: ${p.opportunityTypes.join(', ')}` : '',
    p.skills?.length ? `Skills: ${p.skills.map((s) => s.name).join(', ')}` : '',
    ...(p.education ?? []).map((e) => `Education: ${[e.degree, e.field, e.institution, e.gradYear].filter(Boolean).join(', ')}`),
    ...(p.projects ?? [])
      .slice(0, 6)
      .map((pr) => `Project: ${pr.name}${pr.skills?.length ? ` (${pr.skills.join(', ')})` : ''}${pr.description ? ` - ${pr.description.slice(0, 200)}` : ''}`),
    (p.summary ?? '').slice(0, 600),
  ];
  return lines.filter(Boolean).join('\n');
}

/** Cache key for an embedding: model + text. */
export function embeddingHash(model: string, text: string): string {
  return contentHash(`${model}\n${text}`);
}

function l2normalise(v: number[]): number[] {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return v.map((x) => x / norm);
}

type FeatureExtractor = (texts: string[], opts: { pooling: 'mean'; normalize: boolean }) => Promise<{ tolist(): number[][] }>;

/**
 * transformers.js `feature-extraction` with Xenova/bge-small-en-v1.5 (ONNX, quantized,
 * 384-d, mean pooling, normalised). Loaded once, lazily, on the first call.
 */
export class LocalEmbedder implements Embedder {
  readonly dim = EMBEDDING_DIM;
  private extractor: Promise<FeatureExtractor> | null = null;

  constructor(
    readonly model = 'Xenova/bge-small-en-v1.5',
    private readonly cacheDir = '/tmp/hf-cache',
    private readonly logger: Logger = nullLogger,
  ) {}

  private load(): Promise<FeatureExtractor> {
    this.extractor ??= (async () => {
      const started = Date.now();
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = this.cacheDir;
      const extractor = await pipeline('feature-extraction', this.model, { dtype: 'q8' });
      this.logger.info({ model: this.model, ms: Date.now() - started, cacheDir: this.cacheDir }, 'embedding model loaded');
      return extractor as unknown as FeatureExtractor;
    })().catch((err: unknown) => {
      this.extractor = null;
      throw err;
    });
    return this.extractor;
  }

  async embed(texts: readonly string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const extractor = await this.load();
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH) {
      const batch = texts.slice(i, i + EMBED_BATCH).map((t) => t || ' ');
      const tensor = await extractor(batch, { pooling: 'mean', normalize: true });
      out.push(...tensor.tolist());
    }
    return out;
  }
}

/** OpenAI `text-embedding-3-small` truncated to 384 dims (BYOK alternative). */
export class OpenAiEmbedder implements Embedder {
  readonly dim = EMBEDDING_DIM;
  readonly model = 'text-embedding-3-small';
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://api.openai.com/v1',
  ) {}

  async embed(texts: readonly string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH) {
      const res = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.model, input: texts.slice(i, i + EMBED_BATCH), dimensions: EMBEDDING_DIM }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`OpenAI embeddings HTTP ${res.status}`);
      const body = (await res.json()) as { data: { embedding: number[]; index: number }[] };
      out.push(...body.data.sort((a, b) => a.index - b.index).map((d) => l2normalise(d.embedding)));
    }
    return out;
  }
}

export function createEmbedder(
  env: { EMBEDDING_PROVIDER: 'local' | 'openai'; EMBEDDING_MODEL: string; OPENAI_API_KEY?: string; HF_HOME: string },
  logger: Logger,
): Embedder {
  if (env.EMBEDDING_PROVIDER === 'openai' && env.OPENAI_API_KEY) return new OpenAiEmbedder(env.OPENAI_API_KEY);
  return new LocalEmbedder(env.EMBEDDING_MODEL, env.HF_HOME, logger);
}

/** Deterministic test embedder: hashed bag-of-words, normalised (no model download). */
export class HashEmbedder implements Embedder {
  readonly dim = EMBEDDING_DIM;
  readonly model = 'test-hash';
  embed(texts: readonly string[]): Promise<number[][]> {
    return Promise.resolve(
      texts.map((t) => {
        const v = new Array<number>(EMBEDDING_DIM).fill(0);
        for (const word of t.toLowerCase().split(/\W+/).filter(Boolean)) {
          let h = 2166136261;
          for (let i = 0; i < word.length; i++) h = Math.imul(h ^ word.charCodeAt(i), 16777619);
          v[Math.abs(h) % EMBEDDING_DIM]! += 1;
        }
        return l2normalise(v);
      }),
    );
  }
}
