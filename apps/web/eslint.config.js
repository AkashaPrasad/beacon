import { globalIgnores } from 'eslint/config';

import { react } from '@kestrel/config/eslint';

export default [
  // Generated or vendored: the MSW worker script, build output, Playwright artefacts.
  globalIgnores([
    'public/mockServiceWorker.js',
    'dist/**',
    'test-results/**',
    'playwright-report/**',
  ]),
  ...react({ tsconfigRootDir: import.meta.dirname }),
  // Build scripts run in Node.
  {
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: {
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        performance: 'readonly',
      },
    },
  },
];
