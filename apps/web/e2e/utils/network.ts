/**
 * Network conditions: offline toggling (browser + fake API together) and DevTools-preset
 * throttling over CDP (Chromium only; WebKit has no equivalent, so callers skip there).
 *
 * Note: CDP throttling applies to real network traffic (the app's JS/CSS/fonts). Fake API
 * responses are fulfilled in-process; use `api.state.latencyMs` to slow those down.
 */
import type { BrowserContext, CDPSession, Page } from '@playwright/test';

import type { MockApi } from './mock-api';

/** Chrome DevTools presets (bytes/s, ms). */
export const NETWORK_PRESETS = {
  slow3g: {
    latency: 2000,
    downloadThroughput: ((500 * 1000) / 8) * 0.8,
    uploadThroughput: ((500 * 1000) / 8) * 0.8,
  },
  fast3g: {
    latency: 562.5,
    downloadThroughput: ((1.6 * 1000 * 1000) / 8) * 0.9,
    uploadThroughput: ((750 * 1000) / 8) * 0.9,
  },
  /** Lighthouse mobile "slow 4G" (150 ms RTT, 1.6 Mbps). */
  slow4g: {
    latency: 150,
    downloadThroughput: (1.6 * 1000 * 1000) / 8,
    uploadThroughput: (750 * 1000) / 8,
  },
} as const;

export type NetworkPreset = keyof typeof NETWORK_PRESETS;

export async function goOffline(context: BrowserContext, api?: MockApi): Promise<void> {
  if (api) api.offline = true;
  await context.setOffline(true);
}

export async function goOnline(context: BrowserContext, api?: MockApi): Promise<void> {
  if (api) api.offline = false;
  await context.setOffline(false);
}

/** `navigator.onLine` as the page sees it. */
export function pageThinksOnline(page: Page): Promise<boolean> {
  return page.evaluate(() => navigator.onLine);
}

export function supportsCdp(page: Page): boolean {
  return page.context().browser()?.browserType().name() === 'chromium';
}

/** Throttle the page's real network with a DevTools preset; returns a function that restores it. */
export async function throttle(
  page: Page,
  preset: NetworkPreset = 'slow3g',
): Promise<() => Promise<void>> {
  if (!supportsCdp(page))
    throw new Error('throttle() needs Chromium (CDP); skip this test on other engines');
  const cdp: CDPSession = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    ...NETWORK_PRESETS[preset],
  });
  return async () => {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await cdp.detach();
  };
}
