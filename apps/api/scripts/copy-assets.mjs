// tsc does not copy non-TS assets; mirror src/seed/data into dist after the build.
import { cpSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
cpSync(resolve(here, '../src/seed/data'), resolve(here, '../dist/seed/data'), { recursive: true });
