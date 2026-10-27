import { describe, expect, it } from 'vitest';

import { pushTargetUrl } from './push-url';

const ORIGIN = 'https://beacon.spacesdrive.cc';

describe('pushTargetUrl', () => {
  it('maps the worker listing link onto the radar route', () => {
    expect(pushTargetUrl('/radar?listing=65f0c0ffee0000000000a001', ORIGIN)).toBe(
      '/radar/65f0c0ffee0000000000a001',
    );
    expect(pushTargetUrl('/radar?listing=abc&view=list', ORIGIN)).toBe('/radar/abc?view=list');
    expect(pushTargetUrl('/tracker?item=t1', ORIGIN)).toBe('/tracker/t1');
    expect(pushTargetUrl('/alerts?rule=r1', ORIGIN)).toBe('/alerts?rule=r1');
  });

  it('keeps other in-app paths and refuses other origins', () => {
    expect(pushTargetUrl('/tracker#nudges', ORIGIN)).toBe('/tracker#nudges');
    expect(pushTargetUrl(`${ORIGIN}/deadlines`, ORIGIN)).toBe('/deadlines');
    expect(pushTargetUrl('https://evil.example/x', ORIGIN)).toBe('/notifications');
    expect(pushTargetUrl(undefined, ORIGIN)).toBe('/notifications');
  });
});
