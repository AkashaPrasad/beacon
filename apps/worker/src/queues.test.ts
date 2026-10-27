import { describe, expect, it } from 'vitest';

import { DEFAULT_JOB_OPTIONS, QUEUE_CONCURRENCY, QUEUE_LIST, QUEUE_NAMES } from './queues.js';

describe('queues', () => {
  it('defines exactly the seven worker queues', () => {
    expect(QUEUE_LIST).toEqual([
      'ingest',
      'extract',
      'embed',
      'match',
      'ghostcheck',
      'notify',
      'cleanup',
    ]);
    expect(new Set(QUEUE_LIST).size).toBe(QUEUE_LIST.length);
  });

  it('has a concurrency setting for every queue and retries with backoff', () => {
    for (const name of QUEUE_LIST) expect(QUEUE_CONCURRENCY[name]).toBeGreaterThan(0);
    expect(QUEUE_CONCURRENCY[QUEUE_NAMES.ingest]).toBe(3);
    expect(DEFAULT_JOB_OPTIONS.attempts).toBe(3);
  });
});
