import { describe, expect, it } from 'vitest';

import { alertRuleInputSchema, alertRulePatchSchema, type AlertRule } from '@kestrel/shared';

import {
  duplicateName,
  inputToPatch,
  isInQuietHours,
  parseReminderValues,
  pushStatus,
  quietHoursSummary,
  remindersSummary,
  ruleToInput,
  testToastCopy,
  unblockHelp,
} from './delivery';
import { envFromSupport } from './push-ask';
import { draftToInput, ruleToDraft } from './rule-draft';

const rule: AlertRule = {
  id: '650000000000000000000099',
  userId: '650000000000000000000001',
  name: 'Hackathons closing soon',
  enabled: true,
  conditions: { minFit: 60, types: ['hackathon'], maxDeadlineDays: 14, locations: ['Bengaluru'], remote: 'remote', keywords: [] },
  channels: ['inapp'],
  cadence: 'daily',
  digestTime: '08:00',
  digestDay: 1,
  quietHours: { start: '22:00', end: '07:00' },
  timezone: 'Asia/Kolkata',
  lastTriggeredAt: null,
  createdAt: new Date('2026-10-20T00:00:00Z'),
  updatedAt: new Date('2026-10-20T00:00:00Z'),
};

describe('edit flow: rule → sentence → PATCH', () => {
  it('produces a PATCH the shared schema accepts, with the rule’s quiet hours but not its zone', () => {
    const result = draftToInput({ ...ruleToDraft(rule), minFit: 80 }, { timezone: 'Asia/Kolkata' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const patch = inputToPatch(result.value);
    expect(alertRulePatchSchema.parse(patch)).toEqual(patch);
    expect(patch).toEqual({
      name: 'Hackathons closing soon',
      conditions: { minFit: 80, types: ['hackathon'], maxDeadlineDays: 14, locations: ['Bengaluru'], remote: 'remote', keywords: [] },
      channels: ['inapp'],
      cadence: 'daily',
      digestTime: '08:00',
      digestDay: 1,
      quietHours: { start: '22:00', end: '07:00' },
    });
    expect(patch).not.toHaveProperty('timezone');
    expect(patch).not.toHaveProperty('enabled');
  });

  it('duplicates as a valid create body with a "(copy)" name within 80 characters', () => {
    const input = ruleToInput(rule, { name: duplicateName(rule.name) });
    expect(alertRuleInputSchema.parse(input)).toMatchObject({ name: 'Hackathons closing soon (copy)', quietHours: rule.quietHours });
    expect(duplicateName('Strong fit internships (copy)')).toBe('Strong fit internships (copy)');
    const long = duplicateName('x'.repeat(80));
    expect(long).toHaveLength(80);
    expect(long.endsWith(' (copy)')).toBe(true);
  });
});

describe('delivery summaries', () => {
  it('summarises reminders and parses toggle values', () => {
    expect(remindersSummary([1, 7, 3])).toBe('7, 3 and 1 days before');
    expect(remindersSummary([1])).toBe('1 day before');
    expect(remindersSummary([])).toBe('Off');
    expect(parseReminderValues(['1', '7', '7', 'x', '0'])).toEqual([7, 1]);
  });

  it('summarises quiet hours, including ones that wrap past midnight', () => {
    expect(quietHoursSummary({ start: '22:00', end: '07:00' }, 'Asia/Kolkata')).toBe('22:00–07:00 IST');
    expect(quietHoursSummary(null)).toBeNull();
    expect(quietHoursSummary({ start: '09:00', end: '09:00' })).toBeNull();
    expect(isInQuietHours({ start: '22:00', end: '07:00' }, '23:30')).toBe(true);
    expect(isInQuietHours({ start: '22:00', end: '07:00' }, '06:59')).toBe(true);
    expect(isInQuietHours({ start: '22:00', end: '07:00' }, '07:00')).toBe(false);
    expect(isInQuietHours({ start: '13:00', end: '14:00' }, '13:30')).toBe(true);
  });
});

describe('push status', () => {
  it('never offers [Turn on] when the browser cannot or will not ask', () => {
    expect(pushStatus(envFromSupport('default'), false)).toMatchObject({ kind: 'off', canTurnOn: true });
    expect(pushStatus(envFromSupport('granted'), true)).toMatchObject({ kind: 'on', canTurnOn: false });
    expect(pushStatus(envFromSupport('granted'), false)).toMatchObject({ kind: 'not-set-up', canTurnOn: true });
    expect(pushStatus(envFromSupport('denied'), false)).toMatchObject({ kind: 'blocked', canTurnOn: false });
    expect(pushStatus(envFromSupport('unsupported'), false)).toMatchObject({ kind: 'unsupported', canTurnOn: false });
    expect(pushStatus(envFromSupport('ios-needs-install'), false)).toMatchObject({ kind: 'ios-install', canTurnOn: false });
  });

  it('maps browser support to the soft-ask environment', () => {
    expect(envFromSupport('ios-needs-install')).toEqual({ permission: 'default', iosNeedsInstall: true });
    expect(envFromSupport('denied')).toEqual({ permission: 'denied', iosNeedsInstall: false });
  });

  it('explains how to unblock per browser and words the test toast by channel', () => {
    expect(unblockHelp('Mozilla/5.0 Firefox/140.0')).toMatch(/^Firefox/);
    expect(unblockHelp('Mozilla/5.0 Chrome/141.0 Safari/537.36')).toMatch(/^Chrome/);
    expect(unblockHelp('Mozilla/5.0 Version/26.0 Safari/605.1.15')).toMatch(/^Safari/);
    expect(testToastCopy(['push', 'inapp'], true)).toBe('Test sent to push and in-app.');
    expect(testToastCopy(['push', 'inapp'], false)).toBe('Test sent. It shows up in your notifications.');
    for (const copy of [testToastCopy(['push'], true), testToastCopy(['inapp'], false)]) {
      expect(copy.split(/\s+/).length).toBeLessThanOrEqual(12);
    }
  });
});
