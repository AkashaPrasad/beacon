import { describe, expect, it } from 'vitest';

import { sampleListings } from '../__fixtures__';
import { DEFAULT_WEIGHTS } from '../constants';
import {
  aiKeyInputSchema,
  alertRuleInputSchema,
  alertRulePatchSchema,
  alertRuleSchema,
  apiErrorSchema,
  countryCodeSchema,
  cursorPageSchema,
  decodeCursor,
  detectSourceResponseSchema,
  encodeCursor,
  feedQuerySchema,
  idSchema,
  isValidTimeZone,
  listingDraftSchema,
  listingPublicSchema,
  listingSchema,
  normaliseWeights,
  notificationSchema,
  objectIdSchema,
  profileInputSchema,
  profilePatchSchema,
  profileSchema,
  publicUserSchema,
  resumeParseResultSchema,
  settingsPatchSchema,
  settingsSchema,
  sourceCreateSchema,
  sourceSchema,
  sourceUpdateSchema,
  timeOfDaySchema,
  timeZoneSchema,
  trackerCreateSchema,
  trackerItemSchema,
  trackerMoveSchema,
  trackerUpdateSchema,
  userSchema,
  weightsInputSchema,
  weightsPatchSchema,
  weightsSchema,
} from './index';

const NOW = '2026-10-27T06:30:00.000Z';
const ok = (result: { success: boolean }) => expect(result.success).toBe(true);
const bad = (result: { success: boolean }) => expect(result.success).toBe(false);

describe('common', () => {
  it('validates ids, codes, times and zones', () => {
    ok(idSchema.safeParse('lst_1'));
    bad(idSchema.safeParse(''));
    ok(objectIdSchema.safeParse('64b7f1f1f1f1f1f1f1f1f1f1'));
    bad(objectIdSchema.safeParse('xyz'));
    expect(countryCodeSchema.parse(' in ')).toBe('IN');
    bad(countryCodeSchema.safeParse('IND'));
    ok(timeOfDaySchema.safeParse('23:59'));
    bad(timeOfDaySchema.safeParse('24:00'));
    ok(timeZoneSchema.safeParse('Asia/Kolkata'));
    bad(timeZoneSchema.safeParse('Mars/Olympus'));
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
  });
});

describe('user', () => {
  const user = {
    id: 'u1',
    email: 'a@b.co',
    name: 'Asha',
    googleSub: 'g-1',
    createdAt: NOW,
    updatedAt: NOW,
  };
  it('applies defaults and coerces dates', () => {
    const parsed = userSchema.parse(user);
    expect(parsed).toMatchObject({ role: 'user', avatarUrl: null, onboardingCompletedAt: null });
    expect(parsed.createdAt).toBeInstanceOf(Date);
    bad(userSchema.safeParse({ ...user, email: 'nope' }));
  });

  it('public user strips the Google subject', () => {
    expect(publicUserSchema.parse({ ...user, googleSub: undefined })).not.toHaveProperty(
      'googleSub',
    );
  });
});

describe('profile', () => {
  it('fills a complete profile from a minimal input', () => {
    const profile = profileSchema.parse({
      userId: 'u1',
      education: [{ institution: 'X', degree: 'B.Tech', gradYear: 2027 }],
    });
    expect(profile).toMatchObject({
      skills: [],
      remotePref: 'any',
      openToRelocate: false,
      stipendFloor: null,
      opportunityTypes: [],
      workAuth: { citizenship: [], authorisedCountries: [], needsSponsorship: false },
      embeddingHash: null,
    });
    expect(profile.education[0]).toMatchObject({
      degreeLevel: 'bachelor',
      current: false,
      gpa: null,
    });
  });

  it('validates nested values', () => {
    bad(profileInputSchema.safeParse({ skills: [{ name: '' }] }));
    bad(profileInputSchema.safeParse({ links: [{ kind: 'github', url: 'ftp://x.y' }] }));
    bad(profileInputSchema.safeParse({ remotePref: 'mars' }));
    ok(profileInputSchema.safeParse({ stipendFloor: { amount: 20_000 } }));
    expect(profileInputSchema.parse({ stipendFloor: { amount: 1 } }).stipendFloor).toEqual({
      amount: 1,
      currency: 'INR',
      period: 'month',
    });
  });

  it('patch applies no defaults (omitted = unchanged)', () => {
    expect(profilePatchSchema.parse({})).toEqual({});
    expect(profilePatchSchema.parse({ headline: null, remotePref: 'remote_only' })).toEqual({
      headline: null,
      remotePref: 'remote_only',
    });
    bad(profilePatchSchema.safeParse({ experienceYears: -1 }));
  });
});

describe('listing', () => {
  const minimal = {
    id: 'l1',
    type: 'internship',
    title: 'SDE Intern',
    company: 'Acme',
    applyUrl: 'https://acme.example/jobs/1',
    sourceId: 's1',
    canonicalKey: 'acme|sde intern|',
    contentHash: 'a'.repeat(64),
    firstSeenAt: NOW,
    lastSeenAt: NOW,
  };

  it('parses the SPEC shape with defaults', () => {
    const listing = listingSchema.parse(minimal);
    expect(listing).toMatchObject({
      remote: 'unknown',
      location: [],
      eligibility: {
        gradYears: [],
        degrees: [],
        minExperienceYears: null,
        citizenship: [],
        other: [],
      },
      ghostRisk: { score: 0, reasons: [] },
      embedding: [],
      seenCount: 1,
      deadlineKind: 'unknown',
      archived: false,
      roleFamily: null,
    });
  });

  it('enforces invariants', () => {
    bad(listingSchema.safeParse({ ...minimal, type: 'gig' }));
    bad(listingSchema.safeParse({ ...minimal, contentHash: 'xyz' }));
    bad(listingSchema.safeParse({ ...minimal, embedding: [1, 2, 3] }));
    ok(listingSchema.safeParse({ ...minimal, embedding: Array.from({ length: 384 }, () => 0) }));
    bad(listingSchema.safeParse({ ...minimal, stipendMin: 50, stipendMax: 10 }));
    bad(listingSchema.safeParse({ ...minimal, applyUrl: 'javascript:alert(1)' }));
    bad(listingSchema.safeParse({ ...minimal, title: 'x'.repeat(301) }));
  });

  it('draft omits id and derived fields; public omits embedding/hash', () => {
    const {
      id: _id,
      canonicalKey: _k,
      contentHash: _h,
      firstSeenAt: _f,
      lastSeenAt: _l,
      ...draft
    } = minimal;
    ok(listingDraftSchema.safeParse(draft));
    bad(listingDraftSchema.safeParse({ ...draft, stipendMin: 9, stipendMax: 1 }));
    const pub = listingPublicSchema.parse(sampleListings[0]);
    expect(pub).not.toHaveProperty('embedding');
    expect(pub).not.toHaveProperty('contentHash');
  });
});

describe('source', () => {
  const source = {
    id: 's1',
    url: 'https://jobs.lever.co/acme',
    name: 'Acme',
    kind: 'lever',
    scope: 'community',
    createdAt: NOW,
    updatedAt: NOW,
  };
  it('parses with defaults and requires an owner for personal sources', () => {
    expect(sourceSchema.parse(source)).toMatchObject({
      ownerId: null,
      enabled: true,
      refreshInterval: 'daily',
      health: 'pending',
      listingsFound: 0,
      config: { boardToken: null, feedUrl: null, provider: null },
    });
    bad(sourceSchema.safeParse({ ...source, scope: 'personal' }));
    ok(sourceSchema.safeParse({ ...source, scope: 'personal', ownerId: 'u1' }));
    bad(sourceSchema.safeParse({ ...source, kind: 'myspace' }));
  });

  it('create/update bodies', () => {
    ok(sourceCreateSchema.safeParse({ url: 'jobs.lever.co/acme' }));
    bad(sourceCreateSchema.safeParse({ url: '' }));
    expect(sourceUpdateSchema.parse({})).toEqual({});
    bad(sourceUpdateSchema.safeParse({ refreshInterval: '5m' }));
  });
});

describe('tracker', () => {
  const item = {
    id: 't1',
    userId: 'u1',
    title: 'SDE Intern',
    company: 'Acme',
    lastActivityAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  };
  it('parses with defaults', () => {
    expect(trackerItemSchema.parse(item)).toMatchObject({
      stage: 'saved',
      notes: '',
      contacts: [],
      nudges: [],
      listingId: null,
    });
    bad(trackerItemSchema.safeParse({ ...item, stage: 'hired' }));
    ok(
      trackerItemSchema.safeParse({
        ...item,
        contacts: [{ name: 'Priya', email: 'p@x.io' }],
        nudges: [{ kind: 'follow_up', dueAt: NOW }],
      }),
    );
  });

  it('create accepts a listing id or a manual entry', () => {
    ok(trackerCreateSchema.safeParse({ listingId: 'l1' }));
    ok(trackerCreateSchema.safeParse({ title: 'Role', company: 'Co', stage: 'applied' }));
    bad(trackerCreateSchema.safeParse({ title: 'Role only' }));
    ok(trackerMoveSchema.safeParse({ stage: 'interview', position: 1.5 }));
    bad(trackerMoveSchema.safeParse({ stage: 'interview' }));
    expect(trackerUpdateSchema.parse({ appliedAt: null })).toEqual({ appliedAt: null });
  });
});

describe('alert rules', () => {
  it('fills defaults: in-app + push, instant, IST', () => {
    const rule = alertRuleInputSchema.parse({ name: 'Hot internships' });
    expect(rule).toMatchObject({
      enabled: true,
      channels: ['inapp', 'push'],
      cadence: 'instant',
      digestTime: '09:00',
      timezone: 'Asia/Kolkata',
      quietHours: null,
      conditions: { minFit: 70, types: [], maxDeadlineDays: null, remote: 'any', keywords: [] },
    });
    ok(
      alertRuleSchema.safeParse({
        ...rule,
        id: 'a1',
        userId: 'u1',
        createdAt: NOW,
        updatedAt: NOW,
      }),
    );
  });

  it('only allows push / in-app channels, at least one, no duplicates', () => {
    bad(alertRuleInputSchema.safeParse({ name: 'x', channels: ['email'] }));
    bad(alertRuleInputSchema.safeParse({ name: 'x', channels: ['telegram'] }));
    bad(alertRuleInputSchema.safeParse({ name: 'x', channels: [] }));
    bad(alertRuleInputSchema.safeParse({ name: 'x', channels: ['push', 'push'] }));
    bad(alertRuleInputSchema.safeParse({ name: 'x', conditions: { minFit: 101 } }));
    bad(alertRuleInputSchema.safeParse({ name: 'x', quietHours: { start: '22:00', end: '7:00' } }));
  });

  it('patch applies no defaults', () => {
    expect(alertRulePatchSchema.parse({ conditions: { minFit: 85 } })).toEqual({
      conditions: { minFit: 85 },
    });
  });
});

describe('notification', () => {
  it('parses with defaults', () => {
    expect(
      notificationSchema.parse({
        id: 'n1',
        userId: 'u1',
        kind: 'match',
        title: 'New match',
        createdAt: NOW,
      }),
    ).toMatchObject({
      body: '',
      channels: ['inapp'],
      readAt: null,
    });
    bad(
      notificationSchema.safeParse({
        id: 'n1',
        userId: 'u1',
        kind: 'email',
        title: 'x',
        createdAt: NOW,
      }),
    );
  });
});

describe('settings', () => {
  it('fills every section and the SPEC default weights', () => {
    const settings = settingsSchema.parse({ userId: 'u1' });
    expect(settings).toMatchObject({
      appearance: {
        theme: 'system',
        density: 'comfortable',
        fontSize: 'md',
        reducedMotion: 'system',
      },
      ai: {
        provider: 'default',
        hasKey: false,
        keyLast4: null,
        enabled: true,
        consentGivenAt: null,
      },
      notifications: {
        push: true,
        inapp: true,
        deadlineReminders: [7, 3, 1],
        timezone: 'Asia/Kolkata',
      },
      privacy: { sendResumeToAi: false },
      weights: DEFAULT_WEIGHTS,
    });
  });

  it('patch is sparse and validated', () => {
    expect(settingsPatchSchema.parse({ appearance: { theme: 'dark' } })).toEqual({
      appearance: { theme: 'dark' },
    });
    expect(settingsPatchSchema.parse({ ai: { consent: true }, weights: { stipend: 10 } })).toEqual({
      ai: { consent: true },
      weights: { stipend: 10 },
    });
    bad(settingsPatchSchema.safeParse({ appearance: { accent: 'Not Valid!' } }));
    bad(settingsPatchSchema.safeParse({ notifications: { timezone: 'Nowhere/Land' } }));
  });

  it('AI key input is write-only and excludes the server default', () => {
    const fakeKey = 'x'.repeat(16);
    ok(aiKeyInputSchema.safeParse({ provider: 'openai', apiKey: fakeKey }));
    bad(aiKeyInputSchema.safeParse({ provider: 'default', apiKey: fakeKey }));
    bad(aiKeyInputSchema.safeParse({ provider: 'openai', apiKey: 'short' }));
  });
});

describe('weights', () => {
  it('normalises to sum 1 and falls back to defaults', () => {
    const w = normaliseWeights({
      semantic: 4,
      skills: 4,
      role: 2,
      eligibility: 0,
      location: 0,
      freshness: 0,
      stipend: 0,
    });
    expect(w).toMatchObject({ semantic: 0.4, skills: 0.4, role: 0.2, stipend: 0 });
    expect(normaliseWeights()).toEqual(DEFAULT_WEIGHTS);
    expect(normaliseWeights(null)).toEqual(DEFAULT_WEIGHTS);
    expect(
      normaliseWeights({
        semantic: Number.NaN,
        skills: -1,
        role: 0,
        eligibility: 0,
        location: 0,
        freshness: 0,
        stipend: 0,
      }),
    ).toEqual(DEFAULT_WEIGHTS);
    const sum = Object.values(normaliseWeights({ stipend: 0.3 })).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('schemas validate and normalise', () => {
    const raw = {
      semantic: 40,
      skills: 25,
      role: 15,
      eligibility: 10,
      location: 5,
      freshness: 5,
      stipend: 0,
    };
    ok(weightsInputSchema.safeParse(raw));
    expect(weightsSchema.parse(raw)).toEqual(DEFAULT_WEIGHTS);
    bad(weightsInputSchema.safeParse({ ...raw, semantic: -1 }));
    bad(
      weightsInputSchema.safeParse({
        semantic: 0,
        skills: 0,
        role: 0,
        eligibility: 0,
        location: 0,
        freshness: 0,
        stipend: 0,
      }),
    );
    expect(weightsPatchSchema.parse({ skills: 50 })).toEqual({ skills: 50 });
  });
});

describe('API DTOs', () => {
  it('cursor round-trips and rejects junk', () => {
    const cursor = encodeCursor({ s: 87.5, id: 'lst_01', d: null, ok: true, u: 'ünïcødé' });
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(cursor)).toEqual({
      s: 87.5,
      id: 'lst_01',
      d: null,
      ok: true,
      u: 'ünïcødé',
    });
    expect(decodeCursor('!!!')).toBeNull();
    expect(decodeCursor(encodeCursor({ a: 1 }).slice(0, 3))).toBeNull();
    expect(decodeCursor(btoa('[1,2]'))).toBeNull();
    expect(decodeCursor(btoa('{"a":{"nested":1}}').replace(/=+$/, ''))).toBeNull();
  });

  it('feed query coerces query-string values', () => {
    const q = feedQuerySchema.parse({
      types: 'internship,hackathon',
      remote: ['remote'],
      limit: '50',
      minFit: '70',
      includeExpired: 'true',
      includeHidden: '0',
      stipendCurrency: 'usd',
    });
    expect(q).toMatchObject({
      types: ['internship', 'hackathon'],
      remote: ['remote'],
      limit: 50,
      minFit: 70,
      includeExpired: true,
      includeHidden: false,
      stipendCurrency: 'USD',
      sort: 'fit',
    });
    expect(feedQuerySchema.parse({})).toMatchObject({
      limit: 20,
      sort: 'fit',
      includeExpired: false,
    });
  });

  it.each([
    [{ limit: '0' }],
    [{ limit: '1000' }],
    [{ limit: 'abc' }],
    [{ types: 'internship,gig' }],
    [{ cursor: 'not a cursor!' }],
    [{ sort: 'random' }],
    [{ includeHidden: 'maybe' }],
  ])('feed query rejects %j', (query) => {
    bad(feedQuerySchema.safeParse(query));
  });

  it('page, detect and resume DTOs', () => {
    ok(cursorPageSchema(idSchema).safeParse({ items: ['a'], nextCursor: null }));
    ok(
      detectSourceResponseSchema.safeParse({
        url: 'https://boards.greenhouse.io/stripe',
        kind: 'greenhouse',
        confidence: 1,
        boardToken: 'stripe',
        company: 'Stripe',
        name: 'Stripe',
        previewCount: 142,
        sampleTitles: ['Software Engineer'],
        costsCredits: false,
        message: 'Detected: Greenhouse board `stripe` → 142 jobs',
      }),
    );
    const resume = resumeParseResultSchema.parse({
      profile: {},
      method: 'deterministic',
      sections: ['education'],
      skills: [{ canonical: 'React', matchedAlias: 'reactjs', count: 2 }],
      emails: [],
      warnings: [],
      textChars: 1200,
    });
    expect(resume.profile.remotePref).toBe('any');
    ok(
      apiErrorSchema.safeParse({
        error: { code: 'validation_failed', message: 'Bad input', details: [] },
      }),
    );
    bad(apiErrorSchema.safeParse({ error: { code: 'teapot', message: 'x' } }));
  });
});
