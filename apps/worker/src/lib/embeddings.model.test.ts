import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { cosineSimilarity, EMBEDDING_DIM } from '@kestrel/shared';

import { EMBED_BATCH, LocalEmbedder } from './embeddings.js';

/**
 * Real transformers.js run of Xenova/bge-small-en-v1.5 (downloads ~34 MB on first use).
 * Opt-in: `RUN_MODEL_TESTS=1 pnpm --filter @kestrel/worker test src/lib/embeddings.model.test.ts`.
 * Prints load/embedding timings and memory so docs/WORKER.md can record them.
 */
const enabled = process.env.RUN_MODEL_TESTS === '1';

describe.skipIf(!enabled)('LocalEmbedder (real model)', () => {
  it(
    'loads lazily once, embeds in batches of 16, returns normalised 384-d vectors that rank sensibly',
    async () => {
      const cacheDir = process.env.HF_HOME ?? join(tmpdir(), 'beacon-hf-cache');
      const embedder = new LocalEmbedder('Xenova/bge-small-en-v1.5', cacheDir);
      const rssBefore = process.memoryUsage().rss;

      const t0 = performance.now();
      const [first] = await embedder.embed(['warm-up']);
      const loadMs = performance.now() - t0;
      expect(first).toHaveLength(EMBEDDING_DIM);

      const texts = [
        'Frontend Engineering Intern. React, TypeScript, CSS. Build dashboards for our product.',
        'Student frontend developer skilled in React and TypeScript, looking for a web internship.',
        'Senior Accountant: ledgers, audits, GST filings and month-end close.',
        ...Array.from({ length: 2 * EMBED_BATCH - 3 }, (_, i) => `Backend intern ${i}: Node.js, PostgreSQL and REST APIs.`),
      ];
      const t1 = performance.now();
      const vectors = await embedder.embed(texts);
      const embedMs = performance.now() - t1;
      const rssAfter = process.memoryUsage().rss;

      expect(vectors).toHaveLength(texts.length);
      for (const v of vectors) {
        expect(v).toHaveLength(EMBEDDING_DIM);
        const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
        expect(norm).toBeCloseTo(1, 3);
      }
      const [job, student, accountant] = vectors as [number[], number[], number[]];
      expect(cosineSimilarity(job, student)).toBeGreaterThan(cosineSimilarity(job, accountant) + 0.1);

      // A second call reuses the loaded pipeline (lazy singleton): no reload cost.
      const t2 = performance.now();
      await embedder.embed(['again']);
      expect(performance.now() - t2).toBeLessThan(loadMs);

      console.log(
        `[model] ${embedder.model}: first call (load + 1 text) ${loadMs.toFixed(0)} ms; ` +
          `${texts.length} texts in ${embedMs.toFixed(0)} ms (${(embedMs / texts.length).toFixed(1)} ms/text, batch ${EMBED_BATCH}); ` +
          `RSS ${(rssBefore / 2 ** 20).toFixed(0)} → ${(rssAfter / 2 ** 20).toFixed(0)} MB; ` +
          `sim(job,student)=${cosineSimilarity(job, student).toFixed(3)} sim(job,accountant)=${cosineSimilarity(job, accountant).toFixed(3)}`,
      );
    },
    300_000,
  );
});
