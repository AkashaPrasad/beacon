/**
 * Lighthouse CI (SPEC §8 "Performance"): mobile, simulated slow 4G, against `vite preview` of
 * the production build. `/radar` is served by the MSW mock (`VITE_MOCK_API=1`), so build with:
 *
 *   pnpm --filter "@kestrel/web..." run build:mock     # vite build + prerender, MSW on
 *   npx -y @lhci/cli@0.15.1 autorun                     # or: pnpm test:lighthouse
 *
 * Reports land in .lighthouseci/ (git-ignored). Env:
 *   LHCI_PORT       preview port when this config starts the server (default 4173)
 *   LHCI_URL_BASE   audit an already running server instead, e.g. production:
 *                   LHCI_URL_BASE=https://beacon.spacesdrive.cc npx -y @lhci/cli@0.15.1 autorun
 *   LHCI_RUNS       runs per URL (default 3)
 */
const port = Number(process.env.LHCI_PORT || 4173);
const base = (process.env.LHCI_URL_BASE || `http://localhost:${port}`).replace(/\/+$/, '');
/** This config starts `vite preview` itself unless a base URL was given. */
const startServer = !process.env.LHCI_URL_BASE;
/** A local preview serves files uncompressed, so transfer sizes are raw bytes. */
const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base);

/** Initial JS budget (SPEC §5): 250 kB gzip on first load, as transfer bytes. */
const JS_BUDGET_BYTES = 250 * 1024;

module.exports = {
  ci: {
    collect: {
      ...(startServer
        ? {
            startServerCommand: `pnpm --filter @kestrel/web exec vite preview --port ${port} --strictPort`,
            startServerReadyPattern: `localhost:${port}`,
            startServerReadyTimeout: 60_000,
          }
        : {}),
      url: [`${base}/`, `${base}/login`, `${base}/radar`],
      numberOfRuns: Number(process.env.LHCI_RUNS || 3),
      settings: {
        // Lighthouse's default config is mobile: Moto G Power viewport, 4x CPU slowdown,
        // simulated slow 4G (150 ms RTT, 1.6 Mbps).
        formFactor: 'mobile',
        throttlingMethod: 'simulate',
        chromeFlags: '--headless=new --no-sandbox --disable-dev-shm-usage',
        // The landing page auto-advances its demo feed; let it settle before the trace ends.
        maxWaitForLoad: 45_000,
        skipAudits: ['uses-http2'],
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['error', { minScore: 0.95 }],
        'categories:seo': ['error', { minScore: 0.9 }],
        // Resource budgets (transfer sizes; vite preview serves uncompressed files, see
        // docs/TESTING.md: the gzip figure is checked separately on the built chunks).
        'resource-summary:script:size': [
          'error',
          { maxNumericValue: local ? JS_BUDGET_BYTES * 3.2 : JS_BUDGET_BYTES },
        ],
        'resource-summary:font:size': ['warn', { maxNumericValue: 160 * 1024 }],
        'resource-summary:third-party:count': ['warn', { maxNumericValue: 2 }],
        // SPEC §5: LCP < 2.0 s on 4G, INP < 200 ms (TBT is the lab proxy).
        'largest-contentful-paint': ['warn', { maxNumericValue: 2000 }],
        'total-blocking-time': ['warn', { maxNumericValue: 200 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: '.lighthouseci',
      reportFilenamePattern: '%%PATHNAME%%-%%DATETIME%%-report.%%EXTENSION%%',
    },
  },
};
