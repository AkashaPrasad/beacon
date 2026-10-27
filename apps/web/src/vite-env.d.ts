/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin, no trailing slash (dev http://localhost:4000, prod https://api-beacon.spacesdrive.cc). */
  readonly VITE_API_URL?: string;
  /** Public web origin used for canonical/OG URLs. */
  readonly VITE_WEB_URL?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_VAPID_PUBLIC_KEY?: string;
  readonly VITE_SENTRY_DSN?: string;
  /** "1" = run against MSW mock handlers (no backend). */
  readonly VITE_MOCK_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Injected by vite.config.ts (package version + build date), used as the query-cache buster. */
declare const __APP_VERSION__: string;
