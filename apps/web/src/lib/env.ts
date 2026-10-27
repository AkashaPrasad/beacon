/** Typed, normalised build-time configuration. Read env only through this module. */
const trimSlash = (url: string) => url.replace(/\/+$/, '');

export const env = {
  apiUrl: trimSlash(import.meta.env.VITE_API_URL || 'http://localhost:4000'),
  webUrl: trimSlash(import.meta.env.VITE_WEB_URL || 'https://beacon.spacesdrive.cc'),
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
  vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '',
  mockApi: import.meta.env.VITE_MOCK_API === '1',
  appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev',
  isDev: import.meta.env.DEV,
} as const;
