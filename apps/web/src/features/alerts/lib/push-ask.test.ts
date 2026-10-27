import { describe, expect, it } from 'vitest';

import { detectIosNeedsInstall, softAskMode } from './push-ask';

describe('softAskMode', () => {
  const env = { permission: 'default', iosNeedsInstall: false } as const;
  it('asks only when push is selected and permission is undecided', () => {
    expect(softAskMode(env, false)).toBe('none');
    expect(softAskMode(env, true)).toBe('ask');
    expect(softAskMode({ ...env, permission: 'granted' }, true)).toBe('none');
  });
  it('never re-asks after a denial and explains unsupported browsers', () => {
    expect(softAskMode({ ...env, permission: 'denied' }, true)).toBe('blocked');
    expect(softAskMode({ ...env, permission: 'unsupported' }, true)).toBe('unsupported');
  });
  it('shows Home Screen guidance on iOS Safari tabs', () => {
    expect(softAskMode({ ...env, iosNeedsInstall: true }, true)).toBe('ios-install');
  });
});

describe('detectIosNeedsInstall', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15';
  it('detects iPhone and iPadOS-as-Mac, unless installed', () => {
    expect(detectIosNeedsInstall({ userAgent: iphone, maxTouchPoints: 5 }, false)).toBe(true);
    expect(detectIosNeedsInstall({ userAgent: iphone, maxTouchPoints: 5 }, true)).toBe(false);
    expect(detectIosNeedsInstall({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)', maxTouchPoints: 5 }, false)).toBe(true);
    expect(detectIosNeedsInstall({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)', maxTouchPoints: 0 }, false)).toBe(false);
  });
});
