import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    fixtures: 'src/__fixtures__/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: { compilerOptions: { composite: false, rootDir: 'src' } },
  target: 'es2022',
  platform: 'neutral',
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
});
