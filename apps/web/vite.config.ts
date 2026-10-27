import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {
  defaultClientConditions,
  defaultServerConditions,
  defineConfig,
  loadEnv,
  type Plugin,
} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};
const src = fileURLToPath(new URL('./src', import.meta.url));

/** Brand colours for the manifest and browser chrome (tokens.css `bg` light / dark). */
const PAPER = '#F7F6F3';

/**
 * index.html placeholders and font preloads (DESIGN §2: preload the latin Geist and Instrument Serif
 * woff2, one per family). `__WEB_URL__` becomes the public origin for canonical/OG tags.
 */
function htmlPlugin(webUrl: string): Plugin {
  return {
    name: 'beacon:html',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        let out = html.replaceAll('__WEB_URL__', webUrl);
        if (ctx.bundle) {
          const fonts = Object.keys(ctx.bundle).filter((file) =>
            /(?:^|\/)(geist-latin-wght-normal|instrument-serif-latin-400-(?:normal|italic))-[\w-]+\.woff2$/.test(
              file,
            ),
          );
          const links = fonts
            .map(
              (file) =>
                `<link rel="preload" href="/${file}" as="font" type="font/woff2" crossorigin />`,
            )
            .join('\n    ');
          if (links) out = out.replace('</title>', `</title>\n    ${links}`);
        }
        return out;
      },
    },
  };
}

/** `public/mockServiceWorker.js` is for mock builds only: drop it from production output. */
function mswWorkerPlugin(mock: boolean): Plugin {
  let outDir = 'dist';
  return {
    name: 'beacon:msw-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      if (!mock) rmSync(join(outDir, 'mockServiceWorker.js'), { force: true });
    },
  };
}

export default defineConfig(({ mode, isSsrBuild }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const webUrl = (env.VITE_WEB_URL || 'https://beacon.spacesdrive.cc').replace(/\/+$/, '');
  const buildDate = new Date().toISOString().slice(0, 10);

  return {
    plugins: [
      react(),
      tailwindcss(),
      htmlPlugin(webUrl),
      mswWorkerPlugin(env.VITE_MOCK_API === '1'),
      !isSsrBuild &&
        VitePWA({
          strategies: 'injectManifest',
          srcDir: 'src',
          filename: 'sw.ts',
          // Registered by src/lib/register-sw.ts (production, never in mock mode).
          injectRegister: false,
          manifestFilename: 'manifest.webmanifest',
          includeAssets: [
            'brand/favicon.svg',
            'brand/png/favicon-32.png',
            'brand/png/apple-touch-icon.png',
          ],
          manifest: {
            id: '/',
            name: 'Beacon',
            short_name: 'Beacon',
            description:
              'Internships, jobs, hackathons, scholarships and research programs, ranked against your resume, with reasons.',
            lang: 'en-IN',
            dir: 'ltr',
            start_url: '/radar',
            scope: '/',
            display: 'standalone',
            orientation: 'any',
            background_color: PAPER,
            theme_color: PAPER,
            categories: ['education', 'productivity'],
            icons: [
              {
                src: '/brand/png/icon-192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any',
              },
              {
                src: '/brand/png/icon-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any',
              },
              {
                src: '/brand/png/icon-maskable-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable',
              },
            ],
            shortcuts: [
              { name: 'Radar', url: '/radar' },
              { name: 'Deadlines', url: '/deadlines' },
              { name: 'Tracker', url: '/tracker' },
            ],
          },
          injectManifest: {
            // Hashed JS/CSS/fonts and the small brand files. HTML is cached at runtime by the worker
            // (network-first), so the prerendered pages written after this step never go stale.
            globPatterns: [
              '**/*.{js,css,svg,webmanifest}',
              'assets/*-latin-*.woff2',
              'brand/png/{icon-192,favicon-32,apple-touch-icon}.png',
            ],
            // MSW (mock builds only) and the worker itself are never precached; other font subsets
            // are cached at runtime when a page needs them.
            globIgnores: ['**/mockServiceWorker.js', '**/*.map', 'sw.js', 'assets/browser-*.js'],
            maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
            rollupFormat: 'iife',
          },
          devOptions: { enabled: false },
        }),
    ],
    define: {
      __APP_VERSION__: JSON.stringify(`${pkg.version}+${buildDate}`),
    },
    resolve: {
      alias: { '@': src },
      // Resolve @kestrel/* workspace packages to their TypeScript sources so Vite can tree-shake per
      // module (the bundled dist is one module) and HMR shared code.
      conditions: ['source', ...defaultClientConditions],
    },
    ssr: {
      // Prerender (scripts/prerender.mjs) loads the app through Vite's SSR transform.
      noExternal: [/^@kestrel\//],
      resolve: { conditions: ['source', ...defaultServerConditions] },
    },
    server: { port: 5173, strictPort: true },
    preview: { port: 4173 },
    build: {
      target: 'es2022',
      sourcemap: true,
      // Inline nothing large; fonts and brand images stay cacheable files.
      assetsInlineLimit: 2048,
      rollupOptions: {
        output: {
          // Ad blockers drop any script whose name looks like analytics ("tracker-*.js", "beacon*.js"),
          // which left the app stuck on its skeleton for anyone running one. Keep chunk names
          // readable but free of those words.
          chunkFileNames: (chunk) => {
            const swap = (word: string, to: string) =>
              /^[A-Z]/.test(word) ? to[0]!.toUpperCase() + to.slice(1) : to;
            const safe = chunk.name
              .replace(/tracker/gi, (w) => swap(w, 'board'))
              .replace(/beacon/gi, (w) => swap(w, 'lamp'))
              .replace(/analytics|pixel|advert/gi, (w) => swap(w, 'stats'));
            return `assets/${safe}-[hash].js`;
          },
        },
      },
    },
  };
});
