import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { createHealthServer } from './health.js';
import { Metrics } from './lib/metrics.js';

let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  await close?.();
  close = undefined;
});

async function start(redisStatus: string, metrics?: () => Promise<string>): Promise<string> {
  const server = createHealthServer({ redisStatus: () => redisStatus, queues: ['ingest'], ...(metrics ? { metrics } : {}) });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  close = () => new Promise((resolve) => server.close(() => resolve()));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

describe('health server', () => {
  it('GET /healthz returns ok with redis status', async () => {
    const base = await start('ready');
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redis: 'ready', queues: ['ingest'] });
  });

  it('GET /readyz is 503 until redis is ready', async () => {
    const base = await start('connecting');
    const res = await fetch(`${base}/readyz`);
    expect(res.status).toBe(503);
  });

  it('GET /metrics serves Prometheus text with beacon_ metric names', async () => {
    const m = new Metrics();
    m.inc('beacon_worker_jobs_processed_total', { queue: 'ingest' }, 2, 'Jobs completed per queue');
    const base = await start('ready', () => Promise.resolve(m.render([{ name: 'beacon_worker_queue_depth', help: 'Jobs', samples: [{ labels: { queue: 'ingest', state: 'waiting' }, value: 3 }] }])));
    const res = await fetch(`${base}/metrics`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    const body = await res.text();
    expect(body).toContain('# TYPE beacon_worker_jobs_processed_total counter');
    expect(body).toContain('beacon_worker_jobs_processed_total{queue="ingest"} 2');
    expect(body).toContain('beacon_worker_queue_depth{queue="ingest",state="waiting"} 3');
  });

  it('unknown paths return 404', async () => {
    const base = await start('ready');
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
  });
});
