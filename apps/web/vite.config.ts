import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Resolve @kestrel/* workspace packages to their TypeScript sources so Vite can
    // tree-shake per module (the bundled dist is one module) and HMR shared code.
    conditions: ['source', ...defaultClientConditions],
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 5173 },
  build: { target: 'es2022', sourcemap: true },
});
