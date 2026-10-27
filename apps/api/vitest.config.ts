import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['src/test/global-setup.ts'],
    setupFiles: ['src/test/setup.ts'],
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: { NODE_ENV: 'test', VECTOR_SEARCH: 'memory' },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/test/**', 'src/index.ts', 'src/types/**'],
      reporter: ['text-summary', 'json-summary'],
      // SPEC §8 target. Every route group has integration tests (measured 87.6% on 2026-10-27).
      thresholds: { lines: 85 },
    },
  },
});
