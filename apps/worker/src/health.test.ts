import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { createHealthServer } from './health.js';

let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  await close?.();
  close = undefined;
});

async function start(redisStatus: string): Promise<string> {
  const server = createHealthServer({ redisStatus: () => redisStatus, queues: ['ingest'] });
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

  it('unknown paths return 404', async () => {
    const base = await start('ready');
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
  });
});
