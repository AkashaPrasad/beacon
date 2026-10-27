// Prerenders the public pages into dist/ after `vite build` (see src/entry-server.tsx).
// The app is loaded through Vite's SSR transform with the same config (aliases, `source` conditions,
// `import.meta.env`), rendered with react-dom/server, and injected into the built index.html.
// The inline script in index.html discards prerendered markup on any other path (SPA fallback).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV = 'production';
// Node ≥ 25 exposes a `localStorage` getter that warns without --localstorage-file; the app guards
// `typeof localStorage === 'undefined'`, so make it plainly absent during prerender.
Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true });
const { createServer } = await import('vite');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const PLACEHOLDER = '<div id="root"><!--app-html--></div>';

const server = await createServer({
  root,
  mode: process.env.MODE || 'production',
  configFile: join(root, 'vite.config.ts'),
  appType: 'custom',
  logLevel: 'warn',
  server: { middlewareMode: true, hmr: false, ws: false },
});

let failed = false;
try {
  const { render, PRERENDER_PAGES } = await server.ssrLoadModule('/src/entry-server.tsx');
  const template = await readFile(join(dist, 'index.html'), 'utf8');
  if (!template.includes(PLACEHOLDER))
    throw new Error('dist/index.html has no #root placeholder (already prerendered?)');
  const webUrl = /<link rel="canonical" href="([^"]+)\/"/.exec(template)?.[1] ?? '';
  for (const page of PRERENDER_PAGES) {
    const started = performance.now();
    const markup = await render(page.path);
    let html = template.replace(
      PLACEHOLDER,
      `<div id="root" data-prerendered="${page.path}">${markup}</div>`,
    );
    if (page.title) html = html.replace(/<title>[^<]*<\/title>/, `<title>${page.title}</title>`);
    if (page.description) {
      html = html.replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${page.description.replaceAll('"', '&quot;')}$2`);
    }
    if (page.path !== '/' && webUrl) {
      html = html
        .replace(
          `<link rel="canonical" href="${webUrl}/" />`,
          `<link rel="canonical" href="${webUrl}${page.path}" />`,
        )
        .replace(
          `<meta property="og:url" content="${webUrl}/" />`,
          `<meta property="og:url" content="${webUrl}${page.path}" />`,
        );
    }
    const file = join(dist, page.file);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, html);
    const kb = (Buffer.byteLength(markup) / 1024).toFixed(1);
    console.log(
      `prerendered ${page.path} → dist/${page.file} (${kb} kB markup, ${Math.round(performance.now() - started)} ms)`,
    );
  }
} catch (error) {
  failed = true;
  console.error('[prerender] failed:', error);
} finally {
  await server.close();
}
process.exit(failed ? 1 : 0);
