import { node } from '@kestrel/config/eslint';

export default [
  ...node({ tsconfigRootDir: import.meta.dirname }),
  {
    // Supertest bodies are `any`; tests call into them freely (the shared config already
    // relaxes the other no-unsafe-* rules for test files).
    files: ['**/*.test.ts', 'src/test/**'],
    rules: {
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
];
