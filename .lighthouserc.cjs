/**
 * Lighthouse CI (SPEC §8 "Performance"): mobile, simulated slow 4G, against `vite preview` of
 * the production build. `/radar` is served by the MSW mock (`VITE_MOCK_API=1`), so build with:
 *
 *   VITE_MOCK_API=1 pnpm --filter "./apps/web..." run build
 *   npx -y @lhci/cli@0.15.1 autorun            # or: pnpm test:lighthouse
 *
 * Reports land in .lighthouseci/ (git-ignored). LHCI_URL_BASE overrides the server, e.g. to
 * audit production: LHCI_URL_BASE=https://beacon.spacesdrive.cc npx -y @lhci/cli@0.15.1 autorun
 */
const base = (process.env.LHCI_URL_BASE || 'http://localhost:4173').replace(/\/+$/, '');
const local = !process.env.LHCI_URL_BASE;

/** Initial JS budget (SPEC §5): 250 kB gzip on first load, as transfer bytes. */
const JS_BUDGET_BYTES = 250 * 1024;

module.exports = {
  ci: {
    collect: {
      ...(local
        ? {
            startServerCommand: 'pnpm --filter @kestrel/web exec vite preview --port 4173 --strictPort',
            startServerReadyPattern: 'localhost:4173',
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
        'resource-summary:script:size': ['error', { maxNumericValue: local ? JS_BUDGET_BYTES * 3.2 : JS_BUDGET_BYTES }],
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
