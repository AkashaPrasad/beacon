import { describe, expect, it } from 'vitest';

import { displayHealth, healthReason, meterState, type Credits } from './health';

const base: Credits = {
  date: '2026-10-27',
  cloudUsedToday: 312,
  cap: 500,
  selfHostedUsedToday: 0,
  backend: 'cloud',
  userUsedToday: 14,
};

describe('meterState', () => {
  it('cloud, under 80 %', () => {
    expect(meterState(base)).toMatchObject({ mode: 'cloud', tone: 'normal', value: '312 / 500' });
  });
  it('warns at 80 % and is danger at the cap', () => {
    expect(meterState({ ...base, cloudUsedToday: 400 }).tone).toBe('warning');
    expect(meterState({ ...base, cloudUsedToday: 500 })).toMatchObject({
      tone: 'danger',
      mode: 'paused',
      ratio: 1,
    });
  });
  it('self-hosted standby keeps crawling after the cap', () => {
    expect(meterState({ ...base, cloudUsedToday: 500, backend: 'selfhosted' }).mode).toBe(
      'selfhosted',
    );
  });
  it('handles a zero cap without dividing by zero', () => {
    expect(meterState({ ...base, cap: 0, cloudUsedToday: 0 })).toMatchObject({
      ratio: 1,
      mode: 'paused',
    });
  });
});

describe('displayHealth', () => {
  const src = { health: 'healthy', kind: 'greenhouse', enabled: true, errorReason: null } as const;
  it('maps worker health to display words', () => {
    expect(displayHealth(src, 'cloud')).toBe('ok');
    expect(displayHealth({ ...src, health: 'degraded' }, 'cloud')).toBe('warning');
    expect(displayHealth({ ...src, health: 'failing' }, 'cloud')).toBe('error');
    expect(displayHealth({ ...src, health: 'pending' }, null)).toBe('pending');
  });
  it('pauses only crawled sources when credits run out', () => {
    expect(displayHealth(src, 'paused')).toBe('ok');
    expect(displayHealth({ ...src, kind: 'firecrawl' }, 'paused')).toBe('paused');
    expect(displayHealth({ ...src, kind: 'firecrawl' }, 'selfhosted')).toBe('ok');
    expect(displayHealth({ ...src, kind: 'firecrawl', enabled: false }, 'paused')).toBe('ok');
  });
  it('honours the worker healthCode', () => {
    expect(
      displayHealth({ ...src, health: 'degraded', healthCode: 'paused:credits' }, 'cloud'),
    ).toBe('paused');
  });
  it('treats a credit error reason as paused', () => {
    expect(
      displayHealth(
        { ...src, health: 'failing', errorReason: '402 insufficient credits' },
        'cloud',
      ),
    ).toBe('paused');
  });
  it('explains each status', () => {
    expect(healthReason({ ...src, health: 'failing', errorReason: '403 Forbidden' }, 'error')).toBe(
      '403 Forbidden',
    );
    expect(healthReason(src, 'paused')).toMatch(/00:00 IST/);
  });
});
