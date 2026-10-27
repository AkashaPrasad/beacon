import { defineConfig } from 'vitest/config';

// QA contract suite: needs a running API (docs/TESTING.md "API contract").
// Run from apps/api: vitest run --config test/contract/vitest.config.ts
export default defineConfig({
  test: {
    root: new URL('.', import.meta.url).pathname,
    include: ['**/*.contract.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 30_000,
  },
});
