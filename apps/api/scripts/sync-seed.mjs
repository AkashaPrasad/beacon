// Copy the repo-root seed/source-packs.json into apps/api (the Docker build context excludes
// seed/). Run after editing the seed file: `pnpm --filter @kestrel/api sync-seed`.
import { copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const from = resolve(here, '../../../seed/source-packs.json');
const to = resolve(here, '../src/seed/data/source-packs.json');
copyFileSync(from, to);
console.log(`copied ${from} -> ${to}`);
