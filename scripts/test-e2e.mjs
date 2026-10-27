// Runs the Playwright end-to-end suite in apps/web once it exists.
// Until apps/web ships a playwright.config.*, this exits 0 with a notice so CI stays green.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const webDir = join(root, 'apps', 'web');
const hasConfig = ['playwright.config.ts', 'playwright.config.js', 'playwright.config.mjs'].some(
  (file) => existsSync(join(webDir, file)),
);

if (!hasConfig) {
  console.log('[test:e2e] apps/web has no playwright config yet; skipping end-to-end tests.');
  process.exit(0);
}

const result = spawnSync(
  'pnpm',
  ['--filter', '@kestrel/web', 'exec', 'playwright', 'test', ...process.argv.slice(2)],
  { cwd: root, stdio: 'inherit' },
);
process.exit(result.status ?? 1);
