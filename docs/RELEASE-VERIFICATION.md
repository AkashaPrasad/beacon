# Release verification — 2026-10-27

## Scope

Completes the in-progress Beacon redesign and feature work across API, worker and web.
The application keeps its existing Cloudflare Pages frontend and AWS Docker backend.

## Repairs covered

- Restored onboarding imports and shared UI component contracts; removed dangling references
  to the retired interests question. Connected the first-run tour and replay navigation.
- Repaired marketing CSS so production builds compile.
- Kept list view explicit after changing the default to grid. Preserved the originating
  screen when opening listing details, including Deadlines.
- Fixed command-menu disabled-state selectors, touch action visibility, card overflow,
  keyboard focus visibility, colour contrast and feed semantics.
- Stabilised source-table sorting to prevent a render loop during source entry. Memoised the
  shared clock date to avoid needless column recomputation.
- Serialised Undo after its original write; added a regression test for a fast Undo.
- Updated stale smoke expectations for cards, persistent source entry and full-page details.
- Verified private env files and personal browser artefacts stay out of version control.

## Commands

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
E2E_BASE_URL=http://127.0.0.1:4180 pnpm --filter @kestrel/web exec playwright test --config e2e/utils/playwright.qa.config.ts e2e/smoke-all.spec.ts --project=chromium --project=mobile
pnpm --filter @kestrel/web exec node scripts/verify-release.mjs http://127.0.0.1:4180
bash scripts/security-check.sh --only audit,leaks,secrets
bash scripts/smoke-prod.sh
```

The mock server is started with `VITE_MOCK_API=1 VITE_API_URL=http://localhost:4999 pnpm
--filter @kestrel/web exec vite --host 127.0.0.1 --port 4180`.

The optional worker ONNX model test is enabled with `RUN_MODEL_TESTS=1`; it downloads the public model on first use.
Mock browser journeys do not establish real Google OAuth success or third-party crawl success;
production HTTP checks and deployment status are recorded separately.

## Design review

The environment has no subagent tool; the Impeccable finish review runs inline using its
fallback reviewer instructions. Review screenshots and axe results are local under
`.impeccable/review/` and are excluded from commits.

## Local results

- Lint: passes (three non-blocking React/TanStack advisory warnings).
- Type checking: passes across all workspace packages.
- Unit/integration: 1,351 passed in the standard suite; the opt-in real embedding-model test also passed (1,352 distinct tests verified).
- Build: API, worker, shared package and prerendered web production builds pass.
- Interaction smoke: 87/87 passed across Chromium desktop, Safari desktop and iPhone WebKit, with no skips.
- Dependency audit: zero vulnerabilities. Secret scans: zero findings in the committable tree,
  Git history, and built assets checked against local secret values.
- Dashboard accessibility: 68/68 passed across Chromium/iPhone WebKit and light/dark themes,
  with zero serious/critical violations, runtime errors or horizontal overflow.

The API now uses `https://api-beacon.spacesdrive.cc`, covered by the zone's Universal SSL
certificate. The previous nested hostname failed the TLS handshake. Frontend response
headers and SPA routing are shipped in Cloudflare Pages `_headers` and `_redirects` files.

## Finish review — ship

| Check          | Verdict                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| Persistence    | Screens, tokens, tests and deployment config are saved in the repository.                                |
| Fidelity       | Neutral/evergreen direction, pinned rail, full-page details and mobile actions match the recorded brief. |
| Ceiling        | Desktop and phone layouts reviewed in both themes.                                                       |
| Material fixes | Clear after source-entry, Undo, navigation, contrast and keyboard-focus repairs.                         |
| Keep           | Explainable scores, full opportunity information and calm shared navigation.                             |

The design detector reported only the chosen self-hosted font family and a marketing timeline
marker; the marker was reduced to a hairline. The font follows the recorded product direction.
The inline finish review substitutes for the unavailable subagent reviewer.

## Production results

- Frontend: `https://beacon.spacesdrive.cc` — Cloudflare Pages deployment succeeded; HTTP 200,
  SPA routing, service worker, manifest, CORS, TLS and security-header smoke checks pass.
- API: `https://api-beacon.spacesdrive.cc` — readiness reports MongoDB and Redis up.
- API and worker: latest application images are healthy on the existing AWS instance;
  GitHub's backend deployment and public smoke check succeed with the corrected OIDC policy.
- Real browser journey: a temporary account registered, selected AI-off consent, completed
  onboarding and reached Radar. Ten dashboard/settings routes loaded without redirects,
  runtime errors or API server errors. The temporary account was deleted (HTTP 204).
- Real local embedding model: the opt-in test passed with normalised 384-dimensional vectors,
  batched inference and semantic ranking assertions; the test completed in 21.61 seconds.

Private env files, credentials and personal browser artefacts remain excluded from commits.
