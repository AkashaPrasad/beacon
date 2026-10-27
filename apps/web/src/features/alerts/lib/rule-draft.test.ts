import { describe, expect, it } from 'vitest';

import { alertRuleInputSchema } from '@kestrel/shared';

import {
  describeDraft,
  draftToInput,
  emptyDraft,
  parseTokens,
  previewSentence,
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

describe('previewSentence (plain language, every condition kept)', () => {
  it('reads like a promise for instant rules', () => {
    expect(previewSentence(starterDraft())).toBe(
      "You'll get a push and an in-app alert the moment a Strong-fit (80+) internship opens.",
    );
    expect(
      previewSentence(
        draft({
          minFit: 70,
          clauses: ['type', 'location', 'deadline', 'keywords'],
          types: ['internship', 'opensource'],
          remote: 'remote',
          locations: ['Bengaluru'],
          deadlineDays: 14,
          keywords: ['go', 'rust'],
          channels: ['push'],
        }),
      ),
    ).toBe(
      "You'll get a push the moment a Good-fit (70+) internship or open-source programme opens — remote or in Bengaluru, closing within 14 days, mentioning go and rust.",
    );
    expect(previewSentence(draft({ minFit: 45, clauses: ['type'], types: ['internship'] }))).toBe(
      "You'll get an in-app alert the moment an internship with a fit of 45 or more opens.",
    );
  });

  it('describes digests with day, time and zone', () => {
    expect(previewSentence(draft({ cadence: 'weekly', digestDay: 1, digestTime: '08:00', clauses: ['type'], types: ['hackathon'] }), 'IST')).toBe(
      "Every Monday at 08:00 IST you'll get an in-app digest of new Strong-fit (80+) hackathons.",
    );
    expect(previewSentence(draft({ cadence: 'daily', channels: ['push', 'inapp'] }))).toBe(
      "Every day at 08:00 you'll get a push and in-app digest of new Strong-fit (80+) listings.",
    );
    expect(previewSentence(draft({ channels: [] }))).toMatch(/^Pick push, in-app or both/);
  });

  it('validates and maps rule-level quiet hours', () => {
    expect(draftToInput(draft({ quietHours: { start: '22:00', end: '07:00' } })).ok).toBe(true);
    const ok = draftToInput(draft({ quietHours: { start: '22:00', end: '07:00' } }));
    expect(ok.ok && ok.value.quietHours).toEqual({ start: '22:00', end: '07:00' });
    expect(draftToInput(draft({ quietHours: { start: '22:00', end: '22:00' } })).errors.quietHours).toBeDefined();
    expect(draftToInput(draft({ quietHours: { start: '7', end: '22:00' } })).errors.quietHours).toBeDefined();
  });
});
