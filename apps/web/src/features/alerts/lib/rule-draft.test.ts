import { alertRuleInputSchema } from '@kestrel/shared';
import { describe, expect, it } from 'vitest';

import {
  describeDraft,
  draftToInput,
  emptyDraft,
  parseTokens,
  ruleToDraft,
  starterDraft,
  suggestName,
  type RuleDraft,
} from './rule-draft';

function draft(patch: Partial<RuleDraft>): RuleDraft {
  return { ...emptyDraft(), ...patch };
}

describe('draftToInput → alertRuleInputSchema', () => {
  it('maps the full sentence to conditions, channels and cadence', () => {
    const result = draftToInput(
      draft({
        minFit: 80,
        clauses: ['type', 'deadline', 'location', 'keywords'],
        types: ['internship', 'hackathon'],
        deadlineDays: 14,
        remote: 'remote',
        locations: ['Bengaluru', ' Bengaluru ', 'Pune'],
        keywords: ['go', 'rust'],
        channels: ['inapp', 'push'],
        cadence: 'daily',
        digestTime: '08:00',
      }),
      { timezone: 'Asia/Kolkata' },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      name: 'Strong fit internships and hackathons · Remote',
      enabled: true,
      conditions: {
        minFit: 80,
        types: ['internship', 'hackathon'],
        maxDeadlineDays: 14,
        remote: 'remote',
        locations: ['Bengaluru', 'Pune'],
        keywords: ['go', 'rust'],
      },
      channels: ['push', 'inapp'],
      cadence: 'daily',
      digestTime: '08:00',
      timezone: 'Asia/Kolkata',
    });
    // The output must round-trip through the shared schema unchanged.
    expect(alertRuleInputSchema.parse(result.value)).toEqual(result.value);
  });

  it('drops values of clauses that are not in the sentence', () => {
    const result = draftToInput(draft({ clauses: [], types: ['research'], keywords: ['x'], remote: 'onsite' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.conditions).toEqual({
      minFit: 80,
      types: [],
      maxDeadlineDays: null,
      locations: [],
      remote: 'any',
      keywords: [],
    });
  });

  it('reports inline errors per bracket', () => {
    const result = draftToInput(
      draft({ clauses: ['type', 'keywords', 'location'], types: [], keywords: [], channels: [] }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual({
      types: 'Pick at least one type, or remove this condition.',
      keywords: 'Add a keyword, or remove this condition.',
      locations: 'Add a place or Remote, or remove this condition.',
      channels: 'Pick push, in-app or both.',
    });
  });

  it('validates the deadline range, name length and digest time', () => {
    expect(draftToInput(draft({ clauses: ['deadline'], deadlineDays: 0 })).errors.deadlineDays).toBe(
      'Use 1–365 days.',
    );
    expect(draftToInput(draft({ name: 'x'.repeat(81), nameTouched: true })).errors.name).toMatch(/80/);
    expect(draftToInput(draft({ name: '   ', nameTouched: true })).errors.name).toBe('Give the rule a name.');
    expect(draftToInput(draft({ cadence: 'weekly', digestTime: '25:00' })).errors.digestTime).toBeDefined();
  });

  it('only ever emits push and in-app channels, de-duplicated', () => {
    const result = draftToInput(draft({ channels: ['push', 'push', 'inapp'] }));
    expect(result.ok && result.value.channels).toEqual(['push', 'inapp']);
  });
});

describe('ruleToDraft', () => {
  it('is the inverse of draftToInput for saved rules', () => {
    const start = draft({
      name: 'Remote Go roles',
      nameTouched: true,
      minFit: 70,
      clauses: ['type', 'deadline', 'location', 'keywords'],
      types: ['fulltime'],
      deadlineDays: 30,
      remote: 'remote',
      locations: [],
      keywords: ['go'],
      channels: ['push'],
      cadence: 'weekly',
      digestDay: 5,
      digestTime: '18:30',
    });
    const result = draftToInput(start);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const back = ruleToDraft({ ...result.value, enabled: true } as Parameters<typeof ruleToDraft>[0]);
    expect(back).toEqual(start);
  });
});

describe('sentence text', () => {
  it('reads as one sentence', () => {
    expect(
      describeDraft(draft({ clauses: ['type', 'deadline'], types: ['internship', 'hackathon'], channels: ['push', 'inapp'] })),
    ).toBe(
      'When fit ≥ 80 and type is Internship or Hackathon and deadline ≤ 14 days → notify me by push and in-app, instantly',
    );
    expect(describeDraft(draft({ cadence: 'weekly', digestDay: 1, digestTime: '08:00' }))).toContain(
      'weekly on Monday at 08:00',
    );
  });

  it('suggests a calm name', () => {
    expect(suggestName(starterDraft())).toBe('Strong fit internships');
    expect(suggestName(draft({ minFit: 65 }))).toBe('Good fit listings');
    expect(suggestName(draft({ minFit: 45, clauses: ['type'], types: ['research', 'hackathon', 'fulltime'] }))).toBe(
      'Fit 45+ listings in 3 types',
    );
  });
});

describe('parseTokens', () => {
  it('splits, trims and de-duplicates', () => {
    expect(parseTokens(' go, rust ,,go\nkubernetes ')).toEqual(['go', 'rust', 'kubernetes']);
  });
});
