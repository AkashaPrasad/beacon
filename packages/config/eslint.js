// Shared ESLint flat-config factories for every Beacon workspace.
// Each workspace has its own `eslint.config.js` that calls one of these with
// `tsconfigRootDir: import.meta.dirname`, so type-aware rules resolve against
// that workspace's tsconfig.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import { importX } from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export const IGNORES = [
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.turbo/**',
  '**/node_modules/**',
  '**/playwright-report/**',
  '**/test-results/**',
  '**/*.d.ts',
];

const TS_FILES = ['**/*.{ts,tsx,mts,cts}'];
const JS_FILES = ['**/*.{js,jsx,mjs,cjs}'];
const TEST_FILES = ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/__fixtures__/**', '**/test/**'];

/**
 * @param {{ tsconfigRootDir: string, globals?: Record<string, boolean | 'readonly' | 'writable'> }} options
 */
function base({ tsconfigRootDir, globals: extraGlobals = {} }) {
  return defineConfig(
    globalIgnores(IGNORES),
    js.configs.recommended,
    {
      files: TS_FILES,
      extends: [tseslint.configs.recommendedTypeChecked],
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
      rules: {
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
        ],
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
        '@typescript-eslint/restrict-template-expressions': [
          'error',
          { allowNumber: true, allowBoolean: true, allowNullish: false },
        ],
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/switch-exhaustiveness-check': 'error',
      },
    },
    {
      files: JS_FILES,
      extends: [tseslint.configs.disableTypeChecked],
    },
    {
      plugins: { 'import-x': importX },
      settings: {
        'import-x/internal-regex': '^@kestrel/',
        'import-x/resolver-next': [
          createTypeScriptImportResolver({ alwaysTryTypes: true, noWarnOnMultipleProjects: true }),
        ],
      },
      rules: {
        'import-x/first': 'error',
        'import-x/newline-after-import': 'error',
        'import-x/no-duplicates': 'error',
        'import-x/order': [
          'error',
          {
            groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
            'newlines-between': 'always',
            alphabetize: { order: 'asc', caseInsensitive: true },
          },
        ],
      },
    },
    {
      languageOptions: {
        ecmaVersion: 2023,
        sourceType: 'module',
        globals: { ...globals.es2021, ...extraGlobals },
      },
      linterOptions: { reportUnusedDisableDirectives: 'error' },
    },
    {
      files: TEST_FILES,
      rules: {
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/unbound-method': 'off',
      },
    },
    prettier,
  );
}

/** Node services (api, worker) and tooling scripts. */
export function node({ tsconfigRootDir }) {
  return base({ tsconfigRootDir, globals: globals.node });
}

/** Isomorphic libraries (packages/shared): runs in Node and the browser. */
export function library({ tsconfigRootDir }) {
  return base({ tsconfigRootDir });
}

/** React apps and component packages (apps/web, packages/ui). */
export function react({ tsconfigRootDir }) {
  return defineConfig(
    base({ tsconfigRootDir, globals: globals.browser }),
    {
      files: ['**/*.{ts,tsx,jsx}'],
      extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
      rules: {
        'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
      },
    },
    {
      // Vendored shadcn/ui primitives export variants/hooks next to components by design.
      files: ['**/components/ui/**/*.{ts,tsx}'],
      rules: { 'react-refresh/only-export-components': 'off' },
    },
  );
}
