// Root config: only lints repo-level tooling files. Every workspace under apps/ and
// packages/ has its own eslint.config.js (ESLint resolves the nearest config per file).
import { globalIgnores } from 'eslint/config';

import { node } from '@kestrel/config/eslint';

export default [
  globalIgnores([
    'apps/**',
    'packages/**',
    'infra/**',
    'brand/**',
    'docs/**',
    'seed/**',
    '.claude/**',
  ]),
  ...node({ tsconfigRootDir: import.meta.dirname }),
];
