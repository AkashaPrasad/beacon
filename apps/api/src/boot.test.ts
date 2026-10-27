import { spawn } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Boots the real entry point under Node's ESM loader (Vitest interops CJS and would hide
 * named-import mistakes such as `import { models } from 'mongoose'`).
 */
describe('boot smoke', () => {
  it('src/index.ts starts under Node ESM and answers /healthz without Mongo or Redis', async () => {
    const port = randomInt(40_000, 50_000);
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
      cwd: apiRoot,
      env: {
        PATH: process.env['PATH'] ?? '',
        NODE_ENV: 'development',
        PORT: String(port),
        LOG_LEVEL: 'silent',
        REDIS_URL: 'redis://127.0.0.1:1',
        SEED_SOURCES: 'false',
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    try {
      let body: unknown = null;
      for (let i = 0; i < 100 && body === null && child.exitCode === null; i += 1) {
        try {
          const res = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(500) });
          body = await res.json();
        } catch {
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      expect(stderr).not.toMatch(/SyntaxError|does not provide an export/);
      expect(body).toEqual({ ok: true });
    } finally {
      child.kill('SIGKILL');
    }
  }, 40_000);
});
