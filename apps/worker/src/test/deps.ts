import { loadEnv } from '../env.js';
import { HashEmbedder } from '../lib/embeddings.js';
import type { ListingLlm } from '../lib/llm.js';
import { Metrics } from '../lib/metrics.js';
import type { PushPayload, PushResult, PushSender, PushTarget } from '../lib/push.js';
import { MemoryVectorIndex } from '../lib/vector.js';
import { nullLogger } from '../logger.js';
import { type PipelineDeps, RecordingEnqueuer } from '../pipelines/deps.js';

import { MemoryRedis } from './memory-redis.js';
import { TEST_NOW } from './samples.js';

export class FakePush implements PushSender {
  enabled = true;
  sent: { target: PushTarget; payload: PushPayload }[] = [];
  /** Endpoints that answer 410 Gone. */
  gone = new Set<string>();
  send(target: PushTarget, payload: PushPayload): Promise<PushResult> {
    if (this.gone.has(target.endpoint)) return Promise.resolve({ ok: false, gone: true, status: 410, error: 'Gone' });
    this.sent.push({ target, payload });
    return Promise.resolve({ ok: true });
  }
}

export interface TestDeps extends PipelineDeps {
  enqueue: RecordingEnqueuer;
  push: FakePush;
  redis: MemoryRedis;
  clock: { now: Date };
}

export function testDeps(overrides: Omit<Partial<PipelineDeps>, 'llm'> & { llm?: Partial<Pick<ListingLlm, 'extractListing' | 'extractIndex'>> | null } = {}): TestDeps {
  const clock = { now: TEST_NOW };
  const { llm, ...rest } = overrides;
  return {
    env: loadEnv({ NODE_ENV: 'test', PUSH_DAILY_CAP: '10' }),
    logger: nullLogger,
    now: () => clock.now,
    redis: new MemoryRedis(() => clock.now.getTime()),
    enqueue: new RecordingEnqueuer(),
    crawler: null,
    embedder: new HashEmbedder(),
    llm: (llm ?? null) as PipelineDeps['llm'],
    vector: new MemoryVectorIndex(0),
    push: new FakePush(),
    metrics: new Metrics(),
    clock,
    ...rest,
  } as TestDeps;
}
