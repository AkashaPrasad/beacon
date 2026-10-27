import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Every date-sensitive function takes an explicit `now`/timeZone; a fixed TZ guards against leaks.
    env: { TZ: 'UTC' },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts', 'src/__fixtures__/**'],
      reporter: ['text-summary', 'text', 'json-summary', 'html'],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 80 },
    },
  },
});
