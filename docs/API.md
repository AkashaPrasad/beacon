# Beacon HTTP API (`apps/api`)

Status: **stable contract, additive changes only.** Owner: api agent. The web app builds against
this file and the worker shares the data contract (§12–§14). Machine-readable spec:
`GET /openapi.json` (generated from the zod schemas), UI at `GET /docs`.

- Base URL: `API_URL` (prod `https://api-beacon.spacesdrive.cc`, dev `http://localhost:4000`).
- Everything is mounted under **`/v1`** except `/healthz`, `/readyz`, `/docs`, `/openapi.json`.
- Request and response bodies are JSON (`application/json`) except the resume upload
  (`multipart/form-data`) and the export (JSON file download). Dates are ISO-8601 strings.
- Ids are 24-hex Mongo ObjectIds. A malformed id is a `404 NOT_FOUND`, the same as a missing one.
- Schema names like `profileInputSchema` refer to `@kestrel/shared` unless marked **(api)**; those
  are defined in `apps/api/src/schemas/*.ts` and listed in `docs/SHARED-REQUESTS.md`.

---

## 1. Conventions

### 1.1 Authentication

| Item            | Value                                                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session         | JWT (HS256, `JWT_SECRET`, 7 days), claims `{ sub: userId, sv: sessionVersion }`                                                                             |
| Cookie          | **`beacon_session`**, `HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`, plus `Secure` in production                                                         |
| Alternative     | `Authorization: Bearer <jwt>` (tests and tools). The cookie wins when both are sent.                                                                        |
| Browser fetch   | `fetch(url, { credentials: 'include' })`. The web and API hosts are same-site (`*.spacesdrive.cc`), so the Lax cookie is sent.                              |
| 401 reasons     | `error.details.reason` is `missing`, `expired`, `invalid` (forged or bad signature) or `revoked` (user deleted, password changed, or logged out everywhere) |
| Sign-in methods | Google (ID token or auth code, §3) **or** email + password (`/v1/auth/register`, `/v1/auth/login`). All of them set the same cookie.                        |

Auth column below: **public** = no session needed, **user** = valid session required.

### 1.2 CSRF

Every mutating request (`POST`, `PUT`, `PATCH`, `DELETE`) under `/v1` must send
**`X-Requested-With: beacon`** (the legacy value `kestrel` is also accepted). Missing or wrong
header → `403 CSRF`. Requests authenticated with `Authorization: Bearer` are exempt, since a
browser cannot attach that header cross-site. Combined with `SameSite=Lax` this blocks
cross-site form posts.

### 1.3 CORS

Allowed origins: `WEB_URL`, `http://localhost:5173` (Vite dev) and `http://localhost:4173` (Vite preview / e2e), with `credentials: true`. Allowed request
headers: `Content-Type`, `X-Requested-With`, `Authorization`. Exposed headers: `RateLimit`,
`RateLimit-Policy`, `Retry-After`, `X-Request-Id`, `Content-Disposition`.

### 1.4 Error envelope

```jsonc
{ "error": { "code": "NOT_FOUND", "message": "Source not found", "details": {/* optional */} } }
```

Validation errors (zod) also carry `issues` at the top of `error`:

```jsonc
{
  "error": {
    "code": "VALIDATION",
    "message": "Invalid request",
    "issues": [
      { "path": ["limit"], "code": "too_big", "message": "Too big: expected number to be <=100" },
    ],
    "details": { "location": "query" },
  },
} // body | query | params
```

| HTTP | `code`                   | When                                                                                                                                                                                                                                                                                   |
| ---- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400  | `VALIDATION`             | zod failure on body/query/params                                                                                                                                                                                                                                                       |
| 400  | `BAD_CURSOR`             | cursor that does not decode or does not match the sort                                                                                                                                                                                                                                 |
| 400  | `BAD_REQUEST`            | malformed JSON, missing multipart file, other client errors                                                                                                                                                                                                                            |
| 401  | `UNAUTHENTICATED`        | no/expired/forged/revoked session (`details.reason`)                                                                                                                                                                                                                                   |
| 401  | `INVALID_GOOGLE_TOKEN`   | Google ID token or code failed verification                                                                                                                                                                                                                                            |
| 401  | `INVALID_CREDENTIALS`    | email/password sign-in failed (always the same message: unknown email, wrong password and Google-only accounts are indistinguishable), or a wrong `currentPassword`                                                                                                                    |
| 403  | `CSRF`                   | missing `X-Requested-With: beacon` on a mutating request                                                                                                                                                                                                                               |
| 403  | `FORBIDDEN`              | e.g. trying to modify a community source; `/v1/admin/*` without `role: 'admin'`                                                                                                                                                                                                        |
| 404  | `NOT_FOUND`              | unknown route, or object missing or **owned by another user** (never 403, so ids don't leak)                                                                                                                                                                                           |
| 409  | `CONFLICT`               | duplicate (source URL already added, listing already tracked; `details.existingId`), email already registered (`details.reason: 'email_in_use'`), stale tracker move (`details.reason: 'stale'`, `details.item`), refresh refused (`details.reason: 'disabled' \| 'recently_checked'`) |
| 413  | `PAYLOAD_TOO_LARGE`      | resume > 10 MB, JSON body > 1 MB, onboarding answers > 32 KB in total                                                                                                                                                                                                                  |
| 415  | `UNSUPPORTED_MEDIA_TYPE` | resume not PDF, DOCX, PNG or JPEG                                                                                                                                                                                                                                                      |
| 422  | `RESUME_NO_TEXT`         | no readable text even after OCR (< 100 chars from a scanned PDF or image), or a DOCX with < 200 chars                                                                                                                                                                                  |
| 422  | `RESUME_UNREADABLE`      | corrupt or encrypted PDF/DOCX, or an image above 40 megapixels                                                                                                                                                                                                                         |
| 422  | `AI_NOT_CONFIGURED`      | `/settings/ai/test` with nothing to test                                                                                                                                                                                                                                               |
| 429  | `RATE_LIMITED`           | see §1.5; `Retry-After` header set, `details.retryAfterSeconds`                                                                                                                                                                                                                        |
| 502  | `UPSTREAM_ERROR`         | detection target unreachable and nothing could be inferred                                                                                                                                                                                                                             |
| 503  | `SERVICE_UNAVAILABLE`    | Mongo/Redis down                                                                                                                                                                                                                                                                       |
| 500  | `INTERNAL`               | anything else (logged with the request id)                                                                                                                                                                                                                                             |

Every response carries `X-Request-Id` (echoes an incoming `X-Request-Id`, else a UUID).

### 1.5 Rate limits (Redis-backed, `rate-limit-redis`, key prefix `rl:`)

| Name        | Limit        | Key       | Applies to                                                                |
| ----------- | ------------ | --------- | ------------------------------------------------------------------------- |
| global      | 300 / 15 min | client IP | every route except `/healthz`, `/readyz`                                  |
| auth        | 10 / min     | client IP | `POST /v1/auth/google`                                                    |
| credentials | 10 / min     | client IP | `POST /v1/auth/register`, `POST /v1/auth/login`, `POST /v1/auth/password` |
| refresh     | 10 / min     | user id   | `POST /v1/sources/:id/refresh`                                            |
| pushtest    | 20 / hour    | user id   | `POST /v1/push/test`                                                      |
| detect      | 20 / min     | user id   | `POST /v1/sources/detect`                                                 |
| resume      | 5 / min      | user id   | `POST /v1/profile/resume`                                                 |
| explain     | 30 / hour    | user id   | `POST /v1/listings/:id/explain`                                           |
| aitest      | 10 / hour    | user id   | `POST /v1/settings/ai/test`                                               |

Headers: IETF draft-8 `RateLimit` and `RateLimit-Policy`, plus `Retry-After` on 429.
`trust proxy = 1` (Caddy sends one `X-Forwarded-For` hop).

### 1.6 Cursor pagination

`?cursor=<opaque>&limit=<1..100, default 20>`. The response is `{ items, nextCursor }`, where
`nextCursor: null` means the last page. Cursors are base64url JSON produced by
`encodeCursor` (shared), e.g. `{ "k": "fit", "s": 87, "id": "<listingId>" }`. Treat them as
opaque. A cursor from a different `sort` → `400 BAD_CURSOR`. An empty result is
`{ items: [], nextCursor: null }`, not 404.

---

## 2. Platform

| Method | Path            | Auth   | Request                      | Response                                                                                                                                    | Errors |
| ------ | --------------- | ------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| GET    | `/healthz`      | public | `?mem=1` adds process memory | `200 { ok: true }` (process up); with `mem=1`: `{ ok: true, mem: { rss, heapUsed, heapTotal, external } }` (bytes, `process.memoryUsage()`) | –      |
| GET    | `/readyz`       | public | –                            | `200 { ok: true, mongo: 'up', redis: 'up' }` or `503 { ok: false, mongo: 'up'\|'down', redis: 'up'\|'down' }`                               | –      |
| GET    | `/openapi.json` | public | –                            | OpenAPI 3.1 document                                                                                                                        | –      |
| GET    | `/docs`         | public | –                            | HTML (Scalar API reference)                                                                                                                 | –      |
| GET    | `/v1/meta`      | public | –                            | `{ name: 'beacon', version, opportunityTypes: {id,label}[], sourceKinds: {id,label}[], trackerStages: {id,label}[], packs: {id,name}[] }`   | –      |

---

## 3. Auth & me

| Method | Path                  | Auth   | Request                                                                                                                                                                                                                                                                                                                       | Response                                                                                                                                                                     | Errors                                                                                    | Rate        |
| ------ | --------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------- |
| GET    | `/v1/auth/google/url` | public | query `state?` (≤ 512 chars, echoed back by Google), `redirectUri?` (default `${WEB_URL}/auth/callback`; must be in the allowlist)                                                                                                                                                                                            | `200 { url: string, redirectUri: string }`, the Google authorization URL (`response_type=code`, `scope=openid email profile`, `prompt=select_account`, `access_type=online`) | 400 (redirectUri not allowed), 503 (Google not configured)                                | global      |
| POST   | `/v1/auth/google`     | public | **(api)** `googleAuthSchema`: `{ credential: string }` (GIS ID token) **or** `{ code: string, redirectUri: url }` (redirect auth-code flow; the API calls `OAuth2Client.getToken({code, redirect_uri})` with `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`, then verifies the returned `id_token` exactly like `credential`)    | `200 { user: PublicUser, isNew: boolean }` + `Set-Cookie: beacon_session=…`                                                                                                  | 400 (validation, or redirectUri not allowed), 401 `INVALID_GOOGLE_TOKEN`, 403 `CSRF`, 429 | auth        |
| POST   | `/v1/auth/register`   | public | **(api)** `registerSchema` `{ email, password (8..72 bytes), name (1..120) }`                                                                                                                                                                                                                                                 | `201 { user: PublicUser, isNew: true }` + `Set-Cookie`                                                                                                                       | 400, 403 `CSRF`, 409 (`email_in_use`), 429                                                | credentials |
| POST   | `/v1/auth/login`      | public | **(api)** `loginSchema` `{ email, password }`                                                                                                                                                                                                                                                                                 | `200 { user: PublicUser, isNew: false }` + `Set-Cookie`                                                                                                                      | 400, 401 `INVALID_CREDENTIALS`, 403 `CSRF`, 429                                           | credentials |
| POST   | `/v1/auth/password`   | user   | **(api)** `passwordSetSchema` `{ password, currentPassword? }` (`currentPassword` required when the account already has one)                                                                                                                                                                                                  | `200 { user: PublicUser }` + a fresh `Set-Cookie`; every other session is signed out                                                                                         | 400, 401 (`INVALID_CREDENTIALS` for a wrong current password), 409, 429                   | credentials |
| POST   | `/v1/auth/logout`     | public | –                                                                                                                                                                                                                                                                                                                             | `204`, clears the cookie (`beacon_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`, plus `Secure` in production)                                                         | 403 `CSRF`                                                                                | global      |
| GET    | `/v1/me`              | user   | –                                                                                                                                                                                                                                                                                                                             | `MeResponse` (below)                                                                                                                                                         | 401                                                                                       | global      |
| PATCH  | `/v1/me`              | user   | **(api)** `mePatchSchema`: `{ name?, onboardingStep?: 'consent'\|'resume'\|'preferences'\|'sources'\|'done', onboardingCompleted?: boolean, consent?: { version: string, aiMode: 'beacon'\|'byok'\|'off', resumeToAi: boolean } }` (the conversational flow saves its own step ids with `PATCH /v1/profile/onboarding`, §4.1) | `MeResponse`                                                                                                                                                                 | 400, 401                                                                                  | global      |

Google verification: `OAuth2Client.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID })`;
requires `email_verified`. Upsert key is `googleSub`; email, name and picture are refreshed on
each login.

**Email + password** (BRIEF addendum): bcrypt cost 12 (`PASSWORD_HASH_COST`), password 8..72
bytes (bcrypt ignores bytes past 72, so longer ones are refused). Emails are trimmed and
lower-cased. **There is no email verification and no password reset** (Beacon has no email
provider); a forgotten password can only be replaced by signing in with Google (same email)
and calling `POST /v1/auth/password`, or by an operator. Account linking:

- A Google account can add a password later with `POST /v1/auth/password`.
- Registering an email that already has any account → `409 email_in_use` ("sign in instead").
- Google sign-in for an email that only has a password account **takes that account over**:
  `googleSub` is attached, and the password plus every outstanding session are revoked, because
  password sign-up is unverified and Google has verified the address (prevents pre-hijacking).
  The seeded admin keeps its password.

`PublicUser` = shared `PublicUser` + `role: 'user' | 'admin'`, `lastSeenFeedAt` and
`authMethods: { google: boolean, password: boolean }`. It never contains `googleSub` or the hash.

**Redirect flow (what the web app uses):** `GET /v1/auth/google/url?state=<nonce+returnTo>` →
navigate to `url` → Google redirects to `/auth/callback?code=…&state=…` → the web page checks
`state` and calls `POST /v1/auth/google { code, redirectUri }`, with `redirectUri` identical to
the one used for the URL. `redirectUri` allowlist: `${WEB_URL}/auth/callback`,
`http://localhost:5173/auth/callback` and `http://localhost:4173/auth/callback` (e2e). Each one
must also be an authorised redirect URI on the Google OAuth client.

`consent` on `PATCH /v1/me` stores `user.consent = { version, aiMode, resumeToAi, at }` and syncs
settings: `ai.enabled = aiMode !== 'off'`, `ai.consentGivenAt = at` when `aiMode === 'beacon'`
and `resumeToAi` is true (else null), `privacy.sendResumeToAi = resumeToAi`.

```ts
MeResponse = {
  user: PublicUser & { lastSeenFeedAt: Date | null },
  onboarding: {
    completed: boolean,                 // = completedAt !== null
    step: string,                       // legacy 'consent' | 'resume' | 'preferences' | 'sources' | 'done', or a
                                        // step id saved by PATCH /v1/profile/onboarding; 'done' once completed
    answers: Record<string, JSON>,      // save-and-resume answers ({} before the first save)
    updatedAt: Date | null,             // last PATCH /v1/profile/onboarding or /complete
    completedAt: Date | null,
    consent: { version: string, aiMode: 'beacon'|'byok'|'off', resumeToAi: boolean, at: Date } | null,
    hasProfile: boolean, hasResume: boolean,
    personalSources: number, enabledPacks: string[],
  },
  settings: {             // summary; the full object is GET /v1/settings
    theme, density, accent, fontSize, reducedMotion,
    aiEnabled: boolean, aiProvider: AiProvider, hasKey: boolean, consentGivenAt: Date | null,
    pushEnabled: boolean, timezone: string,
  },
  unreadNotifications: number,
}
```

---

## 4. Profile & resume

| Method | Path                              | Auth | Request                                                                                                                                                                                                     | Response                                                    | Errors                                                                        | Rate   |
| ------ | --------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------- | ------ |
| GET    | `/v1/profile`                     | user | –                                                                                                                                                                                                           | `ProfileResponse`                                           | 401                                                                           | global |
| PUT    | `/v1/profile`                     | user | `profileInputSchema` (full replace; defaults fill omitted fields)                                                                                                                                           | `ProfileResponse`                                           | 400, 401                                                                      | global |
| PATCH  | `/v1/profile`                     | user | `profilePatchSchema` (omitted = unchanged)                                                                                                                                                                  | `ProfileResponse`                                           | 400, 401                                                                      | global |
| POST   | `/v1/profile/resume`              | user | `multipart/form-data`, field **`file`**, ≤ 10 MB: PDF, DOCX, **PNG or JPEG** (scans and photos are read with OCR). Query `?save=true` also merges the result into the stored profile (default: draft only). | `ResumeUploadResponse`                                      | 400 (no file), 401, 413, 415, 422 `RESUME_NO_TEXT` / `RESUME_UNREADABLE`, 429 | resume |
| PATCH  | `/v1/profile/onboarding`          | user | **(api)** `onboardingProgressSchema` `{ step?: string, answers?: Record<string, JSON> }` (at least one; see §4.1)                                                                                           | `MeResponse`                                                | 400, 401, 403 `CSRF`, 413                                                     | global |
| POST   | `/v1/profile/onboarding/complete` | user | **(api)** `onboardingCompleteSchema` `{ answers?: Record<string, JSON> }` (optional last answers)                                                                                                           | `MeResponse` (`onboarding.completed: true`, `step: 'done'`) | 400, 401, 403 `CSRF`, 413                                                     | global |

```ts
ProfileResponse = { profile: Profile, exists: boolean, profileHash: string | null,
                    resume: { fileName, mimeType, size, textChars, uploadedAt, parsedFrom,
                              extraction?: 'text' | 'ocr' /* absent on uploads before OCR existed */ } | null }
ResumeUploadResponse = {
  profile: ProfileInput,                 // editable draft (complete, defaults applied)
  parsedFrom: 'deterministic' | 'llm',   // 'llm' = deterministic result enriched by the LLM
  warnings: string[],                    // e.g. "No skills section found", "AI enrichment skipped: daily limit reached"
  sections: string[],                    // detected: education | experience | projects | skills | links | summary | ...
  skills: { canonical, matchedAlias, count }[],
  emails: string[], phones: string[],
  textChars: number,
  extraction: 'text' | 'ocr',            // 'ocr' = read from a scanned PDF or a PNG/JPEG image
  ocr: { pages: number, confidence: number /* tesseract mean, 0..100 */ } | null,   // set when extraction = 'ocr'
  saved: boolean,                        // true when ?save=true merged and stored it
}
```

- When `GET /v1/profile` has no stored profile, it returns the defaults with `exists: false`.
- Detection: magic bytes plus MIME type. PDF via `unpdf`, DOCX via `mammoth`, PNG and JPEG by
  signature. Anything else, including `.doc`, HEIC and `.exe`, → 415.
- **OCR (scans and photos).** When a PDF's text layer has fewer than 200 characters, its first
  **4 pages** are rendered at **150 dpi** (pdf.js via `unpdf` + `@napi-rs/canvas`, longest side
  capped at 4000 px) and read with **tesseract.js** (English LSTM model vendored from
  `@tesseract.js-data/eng`; nothing is downloaded at runtime). PNG/JPEG uploads go straight to OCR
  (images above 40 MP → 422 `RESUME_UNREADABLE`; larger than 4000 px on the long side are scaled
  down). The longer of text layer and OCR text wins and goes through the same deterministic
  parser and LLM enrichment as any resume. `extraction: 'ocr'` adds the first warning
  **"We read this from a scan — double-check the details."** Only when OCR also yields fewer than
  100 characters is the answer `422 RESUME_NO_TEXT` (`details: { textChars, minChars: 100, ocr: true,
ocrError? }`; a DOCX keeps the 200-character rule with `ocr: false`).
- **Time budget.** OCR gets 60 s (including time queued behind another upload; one tesseract
  worker serves the process, created on first use and stopped after 5 idle minutes). The whole
  upload answers within ~85 s: LLM enrichment only gets what is left of the budget and is skipped
  with a warning when less than 5 s remain. Typical times: a one-page scan ≈ 1.3 s cold, ≈ 0.5 s warm.
- LLM enrichment runs only when settings `ai.enabled`, `privacy.sendResumeToAi` and a configured
  provider (server default or BYOK) all hold, and the user is under the daily cap. Any failure
  falls back to the deterministic result plus a warning.
- **Side effects:** when a save changes `profileHash`, the API enqueues `embed {kind:'profile',userId}`
  and `match {userId, reason:'profile'}` (see §13).

### 4.1 Onboarding save and resume

The conversational onboarding (docs/UX-RESTRUCTURE.md §3) persists every page so a returning user
lands on the step they left, with their answers filled in. Structured profile data still goes
through `PUT`/`PATCH /v1/profile`; `answers` is the flow's own UI state (it is in the export).

- `PATCH /v1/profile/onboarding { step?, answers? }`
  - `step`: lower-case slug `^[a-z][a-z0-9-]{0,39}$` (e.g. `degree`, `role-families`, `review`).
    Stored as `onboarding.step`. Ignored once onboarding is completed (the step stays `done`).
  - `answers`: answer id (`^[A-Za-z][A-Za-z0-9_-]{0,63}$`) → any JSON value. **Merged** key by key
    into the stored answers (atomic per key); a `null` value removes that answer; keys you do not
    send are kept. At most 100 answers and 32 KB of JSON in total (413 `PAYLOAD_TOO_LARGE`, with
    `details: { bytes, maxBytes }`). Nested keys may not start with `$` or contain `.` (400).
  - Answers can still be edited after completion (Profile links back to the questions).
- `POST /v1/profile/onboarding/complete { answers? }` merges the optional answers, sets
  `step: 'done'` and `completedAt` (idempotent: a second call keeps the first `completedAt`), and,
  when a profile exists, enqueues `embed {kind:'profile'}` + `match {reason:'profile'}` so the
  "Customising your radar" screen can poll `GET /v1/feed/summary` until `warmingUp` is false.
- Both answer the full `MeResponse` (drop it straight into the `me` query cache).
- The legacy `PATCH /v1/me { onboardingStep, onboardingCompleted }` still works and shares the same
  stored step and completion fields.

---

## 5. Sources

| Method | Path                                | Auth | Request                                                                                                                                           | Response                                                                                                                                                                                    | Errors                                                                                                                             | Rate    |
| ------ | ----------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------- |
| GET    | `/v1/sources`                       | user | –                                                                                                                                                 | `{ items: SourceDTO[] }` (the user's personal sources, newest first)                                                                                                                        | 401                                                                                                                                | global  |
| POST   | `/v1/sources`                       | user | **(api)** `sourceCreateBodySchema` = `sourceCreateSchema` + optional `{ kind, boardToken, feedUrl }` (from a previous detect; skips re-detection) | `201 { source: SourceDTO, detection: DetectResult \| null }`                                                                                                                                | 400, 401, 409 `CONFLICT` (same normalised URL), 429                                                                                | global  |
| GET    | `/v1/sources/:id`                   | user | –                                                                                                                                                 | `{ source: SourceDTO }` (own personal source, or any community source)                                                                                                                      | 401, 404                                                                                                                           | global  |
| PATCH  | `/v1/sources/:id`                   | user | `sourceUpdateSchema`                                                                                                                              | `{ source: SourceDTO }`                                                                                                                                                                     | 400, 401, 403 (community), 404                                                                                                     | global  |
| DELETE | `/v1/sources/:id`                   | user | –                                                                                                                                                 | `204`                                                                                                                                                                                       | 401, 403 (community), 404                                                                                                          | global  |
| POST   | `/v1/sources/:id/refresh`           | user | –                                                                                                                                                 | `202 { queued: true, jobId, source: SourceDTO }` (enqueues `ingest {sourceId, reason:'manual'}`). Own personal source, or a **subscribed** community source not checked in the last 15 min. | 401, 404 (foreign, or community not subscribed), 409 (`disabled`, `recently_checked` + `retryAfterSeconds`), 429, 503 (queue down) | refresh |
| GET    | `/v1/sources/community`             | user | query **(api)** `communitySourcesQuerySchema`: `pack?`, `kind?`, `q?`, `cursor?`, `limit?` (1..200, default 100)                                  | `{ items: (SourceDTO & { subscribed: boolean })[], nextCursor }`                                                                                                                            | 400, 401                                                                                                                           | global  |
| GET    | `/v1/sources/packs`                 | user | –                                                                                                                                                 | `{ items: PackDTO[] }`                                                                                                                                                                      | 401                                                                                                                                | global  |
| POST   | `/v1/sources/packs/:packId/enable`  | user | –                                                                                                                                                 | `{ pack: PackDTO, subscribed: number, ingestQueued: number }`                                                                                                                               | 401, 404                                                                                                                           | global  |
| POST   | `/v1/sources/packs/:packId/disable` | user | –                                                                                                                                                 | `{ pack: PackDTO, unsubscribed: number }`                                                                                                                                                   | 401, 404                                                                                                                           | global  |
| POST   | `/v1/sources/detect`                | user | `detectSourceRequestSchema` `{ url }` (scheme optional)                                                                                           | `DetectResult`                                                                                                                                                                              | 400, 401, 429, 502                                                                                                                 | detect  |
| GET    | `/v1/sources/credits`               | user | –                                                                                                                                                 | `CreditsResponse`                                                                                                                                                                           | 401                                                                                                                                | global  |

```ts
SourceDTO = Source /* shared shape, ids as strings */ & {
  companyDomain: string | null,
  packIds: string[],                 // every pack containing it (community)
  healthCode: string | null,         // worker detail: ok | not_modified | auth | notfound | ratelimited | network | parse | blocked | paused:credits (null before the first run)
  lastSuccessAt: Date | null, consecutiveFailures: number,
}
PackDTO = { id: string, name: string, sourceCount: number, kinds: Partial<Record<SourceKind, number>>,
            optional: boolean, enabled: boolean }
DetectResult = DetectSourceResponse /* shared: url, kind, confidence, boardToken, company, name,
                                       previewCount, sampleTitles, costsCredits, message */ & {
  valid: boolean,               // false: ATS pattern matched but board is empty/missing (e.g. Greenhouse 404)
  apiUrl: string | null,        // JSON/feed endpoint the worker will poll
  companyName: string | null,   // same as `company`
  companyDomain: string | null,
  finalUrl: string | null,      // after ≤ 3 redirects (null when no fetch was needed)
  config: { boardToken: string|null, feedUrl: string|null, provider: string|null },
}
CreditsResponse = { date: 'YYYY-MM-DD' /* UTC */, cloudUsedToday: number, cap: number,
                    selfHostedUsedToday: number, backend: 'cloud' | 'selfhosted', userUsedToday: number,
                    backendReason: string | null,   // why it switched: payment_required | daily_cap | low_balance:<n>
                    cloudRemaining: number | null } // last Firecrawl /v2/team/credit-usage result (hourly)
```

- Pack ids: `top-indian-product`, `faang-plus-india`, `yc-startups-interns`, `hackathons-india`,
  `scholarships-engineering`, `remote-friendly-startups`, `opensource-programs`. Seed-file aliases
  (`india-product`, `faang-india`, `yc-startups`, `hackathons`, `scholarships`,
  `remote-friendly`) are accepted in `:packId` and `?pack=`.
- Detection order: URL pattern (`boards.greenhouse.io/<t>`, `job-boards.greenhouse.io/<t>`,
  `jobs.lever.co/<c>`, `jobs.ashbyhq.com/<b>`, `careers.smartrecruiters.com/<C>`,
  `apply.workable.com/<s>`, `<tenant>.<wdN>.myworkdayjobs.com/[<locale>/]<site>`, known public-API
  hosts) → otherwise fetch the page (10 s timeout, 2 MB cap, ≤ 3 redirects, private and loopback
  addresses refused) → RSS/Atom body, or ATS links/embeds in the HTML, or
  `<link rel="alternate" type="application/(rss|atom)+xml">` → otherwise `firecrawl`
  (`previewCount: null`, `costsCredits: true`). For ATS kinds the JSON endpoint is called to
  count postings: Greenhouse 404 → `valid:false`; SmartRecruiters `totalFound`; Workday POST
  `{appliedFacets:{},limit:20,offset:0,searchText:""}` → `total`.
- **Side effects:** create, or PATCH to `enabled:true` → `ingest {sourceId}`. Pack enable →
  `ingest {sourceId}` for each pack source not checked within its refresh interval, plus
  `match {userId, reason:'sources'}`. Pack disable and source delete → `match {userId, reason:'sources'}`.

---

## 6. Feed & listings

| Method | Path                       | Auth | Request                                                          | Response                                                                                                                          | Errors                               | Rate    |
| ------ | -------------------------- | ---- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------- |
| GET    | `/v1/feed`                 | user | query **(api)** `feedQueryApiSchema` (below)                     | `FeedResponse`                                                                                                                    | 400 `VALIDATION` / `BAD_CURSOR`, 401 | global  |
| GET    | `/v1/feed/facets`          | user | the same query as `/v1/feed` (`cursor`, `limit`, `sort` ignored) | `FeedFacets` (conditional rail counts, cached 60 s)                                                                               | 400 `VALIDATION`, 401                | global  |
| GET    | `/v1/feed/summary`         | user | –                                                                | `FeedSummary`                                                                                                                     | 401                                  | global  |
| POST   | `/v1/feed/seen`            | user | –                                                                | `204` (sets `user.lastSeenFeedAt = now`)                                                                                          | 401                                  | global  |
| GET    | `/v1/listings/:id`         | user | –                                                                | `ListingDetail`                                                                                                                   | 401, 404                             | global  |
| POST   | `/v1/listings/:id/save`    | user | –                                                                | `{ listingId, saved, hidden, trackerItemId, tracker: { id, stage } \| null }`; **also tracks the listing at `saved`** (see below) | 401, 404                             | global  |
| POST   | `/v1/listings/:id/unsave`  | user | –                                                                | same; removes the tracker item only while it is still `saved`                                                                     | 401, 404                             | global  |
| POST   | `/v1/listings/:id/hide`    | user | –                                                                | same                                                                                                                              | 401, 404                             | global  |
| POST   | `/v1/listings/:id/unhide`  | user | –                                                                | same                                                                                                                              | 401, 404                             | global  |
| POST   | `/v1/listings/:id/explain` | user | –                                                                | `Explanation`                                                                                                                     | 401, 404, 429                        | explain |

**Feed query** = shared `feedQuerySchema` (`q, types, remote, locations, deadlineWithinDays,
postedWithinDays, minStipend, stipendCurrency, gradYear, company, sourceId, minFit,
includeExpired, includeHidden, sort, cursor, limit`) **plus** `companies` (csv), `sourceIds`
(csv), `savedOnly` (bool), `hideHidden` (bool, default true; `includeHidden=true` or
`hideHidden=false` shows hidden listings). Arrays accept `a,b` or repeated params. `sort` is
`fit` (default; score desc), `deadline` (soonest first, no-deadline last) or `posted` (newest first).

```ts
FeedResponse = {
  items: FeedItemDTO[], nextCursor: string | null,
  warmingUp: boolean,     // true = no match docs yet; items come from the cold-start path
  total?: number,         // only on the first page
}
FeedItemDTO = {
  listing: ListingPublic,         // descriptionMd truncated to 500 chars in the feed
  fit: FitResult | null,          // null while warming up
  score: number | null,           // = fit.score
  saved: boolean, hidden: boolean, trackerItemId: string | null,
  tracker: { id: string, stage: TrackerStage } | null,   // "In Tracker · Applied" (UX spec A4 `trackerStage` = tracker.stage)
}
FeedSummary = { total: number, byType: Record<OpportunityType, number>, deadlinesThisWeek: number,
                nextDeadlineAt: Date | null,   // earliest upcoming deadline among visible, unhidden listings
                followUpsDue: number,          // tracker items in `applied` idle ≥ 10 days (lastActivityAt); same rule as analytics followUp + moveOn
                newSinceLastVisit: number, lastSeenFeedAt: Date | null, saved: number, warmingUp: boolean }
FeedFacets = {
  warmingUp: boolean,
  total: number,                                          // every current filter applied (= the feed's total)
  fit: { min: 80|60|40|0, label: 'Strong fit'|'Good fit'|'Partial fit'|'Weak fit', count }[] | null,   // score ≥ min; null while warming up
  types: Record<OpportunityType, number>,
  remote: Record<'remote'|'hybrid'|'onsite'|'unknown', number>,
  deadline: { within: { days: 7|14|30, count }[], none: number },   // none = no fixed deadline (rolling/unknown)
  freshness: { within: { days: 1|7|30, count }[] },               // posted (else first seen) within N days
}
ListingDetail = {
  listing: ListingPublic, descriptionHtml: string /* markdown → HTML, sanitize-html allowlist; links get
                                                     rel="noopener noreferrer nofollow" target="_blank" */,
  fit: FitResult | null, matchedSkills: string[], missingSkills: string[],
  saved: boolean, hidden: boolean, trackerItemId: string | null,
  tracker: { id: string, stage: TrackerStage } | null,
  source: { id, name, kind, scope } | null,
  applyLinkHealth: { status: 'ok'|'dead'|'redirect_home'|'error'|'unknown', httpStatus: number|null,
                     checkedAt: Date|null, reasons: GhostReason[] },
  similar: { listing: ListingPublic /* descriptionMd '' */, score: number | null }[],   // ≤ 6
}
Explanation = { listingId, profileHash: string | null, source: 'llm' | 'cache' | 'deterministic',
                whyFit: string[] /* ≤3 */, gaps: string[] /* ≤2 */, tailoringTips: string[] /* ≤3 */,
                generatedAt: Date }
```

- Without match docs (cold start), the feed returns visible listings by `postedAt` desc, or by
  vector similarity when the profile already has an embedding, with `fit: null` and
  `warmingUp: true`. `minFit` and `sort=fit` are ignored on that path.
- Visible listings are those from the user's personal sources, plus subscribed community
  sources, plus any listing that has a match doc for the user. If the user has no sources at
  all, all community listings are visible. Anything else is a 404 on `/v1/listings/:id`.
- Archived listings are excluded. Past-deadline listings are excluded unless `includeExpired=true`.
- **Facets** are conditional counts: each facet applies every current filter **except its own**
  (types ignores `types`, remote ignores `remote`, deadline ignores `deadlineWithinDays`, freshness
  ignores `postedWithinDays`, fit ignores `minFit`), so a count says what picking that option would
  show. Counts are cumulative within a facet (`days: 14` includes `days: 7`; `fit.min: 60` includes
  80). Hidden/saved-only/expired rules apply as in the feed. Cached per user + filter set for 60 s.
- **Save = Tracker** (UX-RESTRUCTURE D3): `save` also creates the tracker item at stage `saved` (top
  of the column) when the listing is not tracked yet, and returns it; a listing already tracked keeps
  its stage. `unsave` deletes the tracker item only while its stage is still `saved` (an application
  that moved on is kept) and re-numbers the column. `POST /v1/tracker { listingId }` after a save is
  `409` with `details.existingId`, as before.
- `explain` is cached per `(userId, listingId, profileHash)` in `explanations`. With AI off, no
  consent or over the cap, it returns the deterministic `fit.explain` plus tips from missing
  skills (`source: 'deterministic'`).

---

## 7. Tracker

| Method | Path                    | Auth | Request                                                                                                                                              | Response                                                   | Errors                                                                       |
| ------ | ----------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| GET    | `/v1/tracker`           | user | query `stage?`                                                                                                                                       | `{ items: TrackerItemDTO[] }` (stage order, then position) | 401                                                                          |
| POST   | `/v1/tracker`           | user | **(api)** `trackerCreateBodySchema` = shared `trackerCreateSchema` **or** `{ manual: { title, company, url?, type?, deadlineAt? }, stage?, notes? }` | `201 { item }`                                             | 400, 401, 404 (listing), 409 (listing already tracked, `details.existingId`) |
| GET    | `/v1/tracker/analytics` | user | –                                                                                                                                                    | `TrackerAnalytics`                                         | 401                                                                          |
| GET    | `/v1/tracker/:id`       | user | –                                                                                                                                                    | `{ item }`                                                 | 401, 404                                                                     |
| PATCH  | `/v1/tracker/:id`       | user | **(api)** `trackerPatchSchema` = shared `trackerUpdateSchema` + `{ stage?, title?, company?, applyUrl? }`                                            | `{ item }`                                                 | 400, 401, 404                                                                |
| POST   | `/v1/tracker/:id/move`  | user | `trackerMoveSchema` `{ stage, position }`                                                                                                            | `{ item, column: { id, position }[] }`                     | 400, 401, 404                                                                |
| DELETE | `/v1/tracker/:id`       | user | –                                                                                                                                                    | `204`                                                      | 401, 404                                                                     |

- `TrackerItemDTO` = shared `TrackerItem` + `history: { stage, at }[]`.
- `move` body is **(api)** `trackerMoveBodySchema` = shared `trackerMoveSchema` + optional
  preconditions `fromStage` (the stage the client thinks the card is in) and `ifUnmodifiedSince`
  (the card's `updatedAt` as last seen). A mismatch → `409 CONFLICT`, `details: { reason: 'stale',
item: TrackerItemDTO }` (another tab moved the card); the client should refetch the board.
- `move`: `position` is the **0-based target index** in the destination column. The server
  re-indexes that column (and the source column) to `0..n-1` and returns the destination
  column's order. Moving to `applied` sets `appliedAt` if empty. Any stage change appends to
  `history`, bumps `lastActivityAt` and clears pending nudges.
- New items go to the top of their column (position 0).

```ts
TrackerAnalytics = {
  total: number, applied: number /* items ever applied */, responded: number,
  responseRate: number /* 0..1 */, medianResponseDays: number | null,
  stageCounts: Record<TrackerStage, number>,
  bestSources: { sourceId: string, name: string, applied: number, responded: number, responseRate: number }[],
  followUp: { id, title, company, appliedAt, daysSinceActivity }[],   // applied ≥ 10 d, no response
  moveOn:   { id, title, company, appliedAt, daysSinceActivity }[],   // applied ≥ 30 d, no response
}
```

A response is the first move from `applied` into `oa`, `interview`, `offer` or `rejected`.

---

## 8. Alerts & push

| Method | Path                         | Auth   | Request                                                                                                                                                                             | Response                                                                                                                                                                                                                                                                 | Errors                    |
| ------ | ---------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| GET    | `/v1/alerts`                 | user   | –                                                                                                                                                                                   | `{ items: AlertRule[] }`                                                                                                                                                                                                                                                 | 401                       |
| POST   | `/v1/alerts`                 | user   | `alertRuleInputSchema` (channels `push`/`inapp` only)                                                                                                                               | `201 { rule }`                                                                                                                                                                                                                                                           | 400, 401                  |
| GET    | `/v1/alerts/:id`             | user   | –                                                                                                                                                                                   | `{ rule }`                                                                                                                                                                                                                                                               | 401, 404                  |
| PATCH  | `/v1/alerts/:id`             | user   | `alertRulePatchSchema`                                                                                                                                                              | `{ rule }`                                                                                                                                                                                                                                                               | 400, 401, 404             |
| DELETE | `/v1/alerts/:id`             | user   | –                                                                                                                                                                                   | `204`                                                                                                                                                                                                                                                                    | 401, 404                  |
| POST   | `/v1/alerts/:id/test`        | user   | –                                                                                                                                                                                   | `202 { queued: true, jobId }` (enqueues `notify {userId, alertRuleId, test:true}`)                                                                                                                                                                                       | 401, 404                  |
| POST   | `/v1/alerts/preview`         | user   | `{ conditions?: AlertConditions }` (shared `alertConditionsSchema`, defaults applied)                                                                                               | `{ matchesLast7d, matchesByDay: number[7] /* oldest first */, sample: { listingId, title, company, score, firstSeenAt }[] /* ≤ 5 */, warmingUp }`: the user's matches first seen in the last 7 days that pass the conditions (same test as the worker's notify pipeline) | 400, 401                  |
| POST   | `/v1/push/test`              | user   | –                                                                                                                                                                                   | `202 { queued: true, jobId }` (enqueues `notify {userId, test:true}`: a test push + in-app notification; Settings > Notifications)                                                                                                                                       | 401, 429, 503             |
| GET    | `/v1/push/vapid-public-key`  | public | –                                                                                                                                                                                   | `{ publicKey: string }` (`VAPID_PUBLIC_KEY`, base64url)                                                                                                                                                                                                                  | 503 (push not configured) |
| GET    | `/v1/push/subscriptions`     | user   | –                                                                                                                                                                                   | `{ items: { id, endpoint, userAgent, createdAt }[] }`                                                                                                                                                                                                                    | 401                       |
| POST   | `/v1/push/subscriptions`     | user   | **(api)** `pushSubscriptionSchema` `{ endpoint: https-url, keys: { p256dh, auth }, expirationTime?: number\|null, userAgent?: string }` (the browser's `PushSubscription.toJSON()`) | `201 { subscription: { id, endpoint, userAgent, createdAt } }` (upsert by endpoint)                                                                                                                                                                                      | 400, 401                  |
| DELETE | `/v1/push/subscriptions`     | user   | `{ endpoint }`                                                                                                                                                                      | `204`                                                                                                                                                                                                                                                                    | 400, 401                  |
| DELETE | `/v1/push/subscriptions/:id` | user   | –                                                                                                                                                                                   | `204`                                                                                                                                                                                                                                                                    | 401, 404                  |

## 9. Notifications

| Method | Path                     | Auth | Request                                                                              | Response                                                            | Errors   |
| ------ | ------------------------ | ---- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | -------- |
| GET    | `/v1/notifications`      | user | query `cursor?`, `limit?`, `unreadOnly?`                                             | `{ items: Notification[], nextCursor, unreadCount }` (newest first) | 400, 401 |
| POST   | `/v1/notifications/read` | user | **(api)** `notificationsReadSchema`: `{ ids: string[] (1..200) }` or `{ all: true }` | `{ updated: number, unreadCount: number }`                          | 400, 401 |

## 10. Settings & account

| Method | Path                    | Auth | Request                                                                                                                                           | Response                                                                                                                                                   | Errors                                 | Rate   |
| ------ | ----------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------ |
| GET    | `/v1/settings`          | user | –                                                                                                                                                 | `Settings` (shared; `ai.hasKey`/`ai.keyLast4`, never the key)                                                                                              | 401                                    | global |
| PATCH  | `/v1/settings`          | user | `settingsPatchSchema`                                                                                                                             | `Settings`                                                                                                                                                 | 400, 401                               | global |
| PUT    | `/v1/settings/ai`       | user | **(api)** `aiSettingsPutSchema` `{ provider: AiProvider, baseUrl?: url\|null, model?: string\|null, apiKey?: string (8..512), enabled: boolean }` | `{ ai: AiSettings }`                                                                                                                                       | 400, 401                               | global |
| POST   | `/v1/settings/ai/test`  | user | optional **(api)** `aiTestSchema` `{ provider?, baseUrl?, model?, apiKey? }` (tests these values, else the saved config)                          | `200 { ok: true, latencyMs, model, provider } \| { ok: false, error: string, latencyMs, model, provider }` (`provider: 'server'` for Beacon's default LLM) | 400, 401, 422 `AI_NOT_CONFIGURED`, 429 | aitest |
| DELETE | `/v1/settings/ai/key`   | user | –                                                                                                                                                 | `{ ai: AiSettings }`                                                                                                                                       | 401                                    | global |
| GET    | `/v1/settings/hints`    | user | –                                                                                                                                                 | `Hints` (below)                                                                                                                                            | 401                                    | global |
| PATCH  | `/v1/settings/hints`    | user | **(api)** `hintsPatchSchema` (below; at least one field)                                                                                          | `Hints`                                                                                                                                                    | 400, 401                               | global |
| GET    | `/v1/settings/ai/usage` | user | –                                                                                                                                                 | `{ date: 'YYYY-MM-DD' /* UTC */, calls, cap /* LLM_DAILY_USER_CAP */, tokens: { prompt, completion, total } }` from `llm:calls:*` / `llm:tokens:*`         | 401                                    | global |
| PUT    | `/v1/settings/weights`  | user | `weightsInputSchema` (7 sliders, any scale)                                                                                                       | `{ weights: WeightsInput, normalised: Weights }`                                                                                                           | 400, 401                               | global |
| GET    | `/v1/settings/export`   | user | –                                                                                                                                                 | streamed `application/json`, `Content-Disposition: attachment; filename="beacon-export-<date>.json"`                                                       | 401                                    | global |
| DELETE | `/v1/account`           | user | –                                                                                                                                                 | `204` + clears cookie                                                                                                                                      | 401                                    | global |

```ts
Hints = {                       // tour, tips/coach marks and rail state, per user (server-side, every device)
  tourDone: boolean,            // tour.completedAt or tour.dismissedAt is set
  tourStep: string | number | null,
  tour: { offeredAt: Date | null, completedAt: Date | null, dismissedAt: Date | null },
  tips: Record<tipId, Date>,    // dismissed tips and coach marks → when
  ui: { railCollapsed: boolean | null, radarView: 'grid' | 'list' | null },
  updatedAt: Date | null,
}
hintsPatchSchema = {
  tourDone?: boolean,           // true: completedAt = now (kept if already set); false: clears completedAt + dismissedAt (replay "Show me around")
  tourStep?: string /* slug */ | number /* 0..50 */ | null,
  tourOffered?: true,           // stamps offeredAt the first time only
  tourDismissed?: boolean,      // true: dismissedAt = now; false: clears it
  tips?: Record<tipId /* ^[a-z][a-z0-9:_-]{0,63}$ */, true | ISO-datetime | null>,   // true/ISO = dismissed, null = show again; merged per id
  ui?: { railCollapsed?: boolean, radarView?: 'grid' | 'list' },
}
```

Hints are not part of `GET /v1/settings`; they are in the export as `hints`.

- PATCH `weights` or `PUT /settings/weights` → `match {userId, reason:'weights'}`. `provider:'default'`
  uses the server LLM (`LLM_*` env). A BYOK key is AES-256-GCM encrypted (§14) and only
  `keyLast4` and `hasKey` are ever returned.
- Export contains `{ exportedAt, user, onboarding { step, completedAt, answers }, profile, settings
(no ciphertext), hints, sources (personal), subscriptions, interactions, matches, tracker, alerts,
notifications, pushSubscriptions (endpoint only), explanations }`.
- Account delete cascade: profile, settings, personal sources, subscriptions, interactions,
  matches, explanations, tracker, alerts, notifications, push subscriptions, then the user.
  Listings ingested from deleted personal sources are left for the worker's cleanup.

### 10.1 Admin

| Method | Path                 | Auth                      | Request | Response                                    | Errors               |
| ------ | -------------------- | ------------------------- | ------- | ------------------------------------------- | -------------------- |
| GET    | `/v1/admin/overview` | user with `role: 'admin'` | –       | `AdminOverview` (`Cache-Control: no-store`) | 401, 403 `FORBIDDEN` |

```ts
AdminOverview = {
  generatedAt: Date,
  users: { total, admins, withPassword, withGoogle, newLast7d },
  listings: { total, active, archived, byType: Record<OpportunityType, number> /* not archived */ },
  sources: { total, byScope: { personal, community }, byHealth: Record<SourceHealth, number>, byKind: Record<SourceKind, number> },
  queues: { name /* ingest extract embed match ghostcheck notify cleanup dead */, waiting, active, delayed, failed, completed }[],
  queuesError: string | null,              // set when Redis was unreachable (queues = [])
  crawler: { date, backend: 'cloud'|'selfhosted', cloudUsedToday, selfHostedUsedToday, cap, backendReason, cloudRemaining },
  recentRuns: { id, sourceId, sourceName, sourceKind, reason, status, startedAt, finishedAt, durationMs,
                found, new, updated, unchanged, errors: { kind, message }[] /* ≤ 5 */, backend, creditsUsed }[],  // last 20 `sourceRuns`
}
```

The admin account is seeded on boot when `ADMIN_EMAIL` and `ADMIN_PASSWORD` are both set: an
existing account with that email (e.g. the owner's Google account) is promoted to `admin`; the
bcrypt hash is replaced only when the configured password no longer verifies (and that also
signs the admin's other sessions out). Middleware: `requireRole('admin')` after `requireAuth`.

### 10.2 Local tooling

- `pnpm --filter @kestrel/api run dev:token -- --email load@beacon.test [--name X] [--days 7]`
  creates or reuses the user `dev:<email>` in `MONGODB_URI`/`MONGODB_DB` and prints a JWT for
  `Authorization: Bearer` on stdout (signed with `JWT_SECRET`, which must match the running API).
  Refuses to run when `NODE_ENV=production`.

---

## 11. OpenAPI

`/openapi.json` is generated at boot from the same zod schemas the routes validate with
(zod 4 `z.toJSONSchema`, OpenAPI 3.1). `/docs` serves the Scalar reference (script from
cdn.jsdelivr.net; this route alone relaxes helmet's CSP).

---

## 12. Data contract (MongoDB, database `MONGODB_DB`)

The api and worker share these collections. Field names are camelCase and `_id` is an ObjectId.
**Bold** marks who writes the document; the other side only reads it, except where noted.

| Collection           | Writer                                                                                                               | Shape (beyond `_id`, `createdAt`, `updatedAt`)                                                                                                                                                                                                                                                                                                                                                    | Indexes                                                                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`              | **api**                                                                                                              | `email, name, avatarUrl, googleSub (null for password-only accounts), passwordHash (bcrypt, null for Google-only; never returned), passwordSetAt, role ('user'\|'admin'), onboardingStep (string, §4.1), onboardingCompletedAt, onboardingAnswers (object, absent until the first save), onboardingUpdatedAt, lastLoginAt, lastSeenFeedAt, consent{version,aiMode,resumeToAi,at}, sessionVersion` | `googleSub_partial_unique` (unique, partial: string), `email`, `email_password_unique` (unique, partial: `passwordHash` string). Boot drops the legacy non-partial `googleSub_1`. |
| `profiles`           | **api** (worker writes `embedding`, `embeddingHash`, `embeddedAt` only)                                              | shared `Profile` fields + `userId, profileHash, resume{fileName,mimeType,size,textChars,uploadedAt,parsedFrom}, resumeText (≤ 50k chars), embedding: number[384], embeddingHash, embeddedAt`                                                                                                                                                                                                      | `userId` unique                                                                                                                                                                   |
| `settings`           | **api**                                                                                                              | shared `Settings` + `ai.keyCiphertext` (string, never returned) + `hints { tourStep, tour{offeredAt,completedAt,dismissedAt}, tips{<id>: Date}, ui{railCollapsed,radarView}, updatedAt }` (absent until the first save)                                                                                                                                                                           | `userId` unique                                                                                                                                                                   |
| `sources`            | **api** creates and edits; **worker** writes `health, lastCheckedAt, listingsFound, errorReason, etag, lastModified` | shared `Source` + `packIds: string[]` (every pack containing it; `packId` is the first), `companyDomain, country, tags, seedKey` (community only: normalised URL), `config.apiUrl, config.method ('GET'\|'POST'), config.body, config.headers, config.tenant, config.site, config.wdHost`                                                                                                         | `ownerId`, `{scope, packIds}`, `{ownerId, url}` unique (partial: personal), `seedKey` unique (partial: string)                                                                    |
| `subscriptions`      | **api**                                                                                                              | `userId, sourceId, packId` (user ↔ community source)                                                                                                                                                                                                                                                                                                                                              | `{userId, sourceId}` unique, `sourceId`                                                                                                                                           |
| `listings`           | **worker**                                                                                                           | shared `Listing` + `sourceIds[]` (every source it was seen in; **visibility checks match `sourceIds` or `sourceId`**) + `applyCheck{status:'ok'\|'dead'\|'redirect_home'\|'error', httpStatus, finalUrl, checkedAt}`                                                                                                                                                                              | `canonicalKey` unique, `sourceId`, `{archived, type, deadlineAt}`, `{postedAt:-1}`, `company`, Atlas vector index (see `apps/api/src/models/indexes.md`)                          |
| `matches`            | **worker**                                                                                                           | `userId, listingId, score, rawScore, components, contributions, weights, caps, ghostPenalty, hardFails, semanticAvailable, details, explain, computedAt, profileHash` (every `FitResult` field at top level)                                                                                                                                                                                      | `{userId, score:-1}`, `{userId, listingId}` unique, `{userId, score:-1, listingId:-1}` (api: the `sort=fit` keyset)                                                               |
| `interactions`       | **api**                                                                                                              | `userId, listingId, saved, savedAt, hidden, hiddenAt`                                                                                                                                                                                                                                                                                                                                             | `{userId, listingId}` unique, `{userId, saved}`                                                                                                                                   |
| `explanations`       | **api**                                                                                                              | `userId, listingId, profileHash, whyFit[], gaps[], tailoringTips[], model, source`                                                                                                                                                                                                                                                                                                                | `{userId, listingId, profileHash}` unique                                                                                                                                         |
| `tracker_items`      | **api** (worker writes `nudges[].sentAt`)                                                                            | shared `TrackerItem` + `history[{stage,at}]`                                                                                                                                                                                                                                                                                                                                                      | `{userId, stage, position}`, `{userId, listingId}`                                                                                                                                |
| `alert_rules`        | **api** (worker writes `lastTriggeredAt`)                                                                            | shared `AlertRule`                                                                                                                                                                                                                                                                                                                                                                                | `userId`                                                                                                                                                                          |
| `notifications`      | **worker** (api writes `readAt`)                                                                                     | shared `Notification`                                                                                                                                                                                                                                                                                                                                                                             | `{userId, createdAt:-1}`, `{userId, readAt}`                                                                                                                                      |
| `push_subscriptions` | **api** (worker deletes on 404/410 from the push service)                                                            | `userId, endpoint, keys{p256dh,auth}, expirationTime, userAgent`                                                                                                                                                                                                                                                                                                                                  | `endpoint` unique, `userId`                                                                                                                                                       |

Community sources are upserted on API boot from `seed/source-packs.json`, vendored as
`apps/api/src/seed/data/source-packs.json`, keyed by `seedKey`. Existing documents are never
overwritten, so worker-written health is kept.

## 13. Queues (BullMQ, `REDIS_URL`; names = `apps/worker/src/queues.ts` `QUEUE_NAMES`)

The API only produces jobs. Job name = queue name. Default options come from the worker's
`DEFAULT_JOB_OPTIONS` (3 attempts, exponential backoff). The BullMQ key prefix is `bull`, or
`QUEUE_PREFIX` when set (it must equal the worker's `QUEUE_PREFIX`).

| Queue    | Payload                                                                 | Producer trigger                                                                | Dedup                                             |
| -------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------- |
| `ingest` | `{ sourceId: string, reason: 'created'\|'enabled'\|'pack'\|'manual' }`  | source create / enable / pack enable / `POST /v1/sources/:id/refresh`           | `deduplication.id = ingest:<sourceId>` (ttl 60 s) |
| `embed`  | `{ kind: 'profile', userId: string }`                                   | profile hash changed; `POST /v1/profile/onboarding/complete` with a profile     | `embed:profile:<userId>` (ttl 10 s)               |
| `match`  | `{ userId: string, reason: 'profile'\|'weights'\|'sources'\|'manual' }` | profile/weights/source changes; onboarding complete                             | `match:<userId>` (ttl 10 s)                       |
| `notify` | `{ userId: string, alertRuleId?: string, test: true }`                  | `POST /v1/alerts/:id/test` (with `alertRuleId`), `POST /v1/push/test` (without) | none                                              |

## 14. Redis keys and crypto (shared with the worker)

| Key                                  | Type       | Writer            | Meaning                                                                         |
| ------------------------------------ | ---------- | ----------------- | ------------------------------------------------------------------------------- |
| `crawler:credits:<YYYY-MM-DD>`       | string int | worker (`INCRBY`) | Firecrawl **cloud** credits used that UTC day (global). TTL ≥ 48 h.             |
| `crawler:selfhosted:<YYYY-MM-DD>`    | string int | worker            | Calls served by the self-hosted standby that UTC day                            |
| `crawler:backend`                    | string     | worker            | `'selfhosted'` while switched over (6 h TTL); absent or `'cloud'` = cloud       |
| `crawler:user:<userId>:<YYYY-MM-DD>` | string int | worker            | Crawl calls attributed to that user's personal sources that day (both backends) |
| `llm:calls:<userId>:<YYYY-MM-DD>`    | string int | api + worker      | LLM calls for the user that day; cap `LLM_DAILY_USER_CAP` (default 50)          |
| `llm:tokens:<userId>:<YYYY-MM-DD>`   | hash       | api + worker      | `prompt`, `completion`, `total` token counters                                  |
| `rl:<limiter>:<key>`                 | –          | api               | rate-limit counters                                                             |

`cap` in `/v1/sources/credits` = `FIRECRAWL_DAILY_CREDIT_CAP` (default 500).

**BYOK key encryption** (`apps/api/src/lib/crypto.ts`; the worker decrypts the same format):
AES-256-GCM with the key `Buffer.from(ENCRYPTION_KEY, 'hex')` (32 bytes), a random 12-byte IV,
and stored value `base64(iv ‖ authTag(16) ‖ ciphertext)`. AAD = `beacon:ai-key:<userId>`.
