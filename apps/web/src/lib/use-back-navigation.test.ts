import { describe, expect, it } from 'vitest';

import { hasInAppHistory, parentPath } from './use-back-navigation';

describe('parentPath', () => {
  it('drops the last segment', () => {
    expect(parentPath('/tracker/abc')).toBe('/tracker');
    expect(parentPath('/sources/packs/hackathons/')).toBe('/sources/packs');
    expect(parentPath('/radar')).toBe('/');
  });
});

describe('hasInAppHistory', () => {
  it('is false on a cold load and true after an in-app navigation', () => {
    window.history.replaceState({ idx: 0 }, '');
    expect(hasInAppHistory('default')).toBe(false);
    expect(hasInAppHistory('abc')).toBe(false);
    window.history.replaceState({ idx: 2 }, '');
    expect(hasInAppHistory('abc')).toBe(true);
  });
});
