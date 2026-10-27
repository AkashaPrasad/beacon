/**
 * Foundation mock state for MSW (`VITE_MOCK_API=1`): session, me, settings, profile, tracker, alerts,
 * notifications, push. Feed and listings come from the radar feature's mocks. Everything is fictional
 * (from @kestrel/shared/fixtures) and dates are shifted so the fixture clock reads as "now".
 *
 * Scenario (read at load, flip with localStorage then reload):
 *   localStorage['beacon:mock:user'] = 'returning' (default, onboarded) | 'new' (consent first) | 'signed-out'
 */
import {
  DEFAULT_WEIGHTS,
  type AlertRule,
  type Notification,
  type Profile,
  type Settings,
  type TrackerStage,
} from '@kestrel/shared';
import { FIXTURE_NOW, sampleListings, sampleProfiles } from '@kestrel/shared/fixtures';

import type { MeResponse, OnboardingStep, TrackerItemDTO } from '@/api/types';

const SHIFT = Date.now() - FIXTURE_NOW.getTime();
export const shift = (d: Date | null | undefined): Date | null => (d ? new Date(d.getTime() + SHIFT) : null);
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

function read(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export type MockUserScenario = 'returning' | 'new' | 'signed-out';
const scenario = (read('beacon:mock:user') as MockUserScenario | null) ?? 'returning';

const USER_ID = '65f0c0ffee0000000000a001';
const user = {
  id: USER_ID,
  email: 'aarav.mehta@example.com',
  name: 'Aarav Mehta',
  avatarUrl: null,
  role: 'user' as const,
  onboardingCompletedAt: scenario === 'new' ? null : ago(20),
  lastLoginAt: ago(1),
  createdAt: ago(30),
  updatedAt: ago(1),
  lastSeenFeedAt: ago(5),
};

const profile: Profile = { ...(sampleProfiles[0] as Profile), userId: USER_ID };

export const settings: Settings = {
  userId: USER_ID,
  appearance: { theme: 'system', accent: 'default', density: 'comfortable', fontSize: 'md', reducedMotion: 'system' },
  ai: { provider: 'default', baseUrl: null, model: null, hasKey: false, keyLast4: null, enabled: true, consentGivenAt: ago(20) },
  notifications: {
    push: false,
    inapp: true,
    deadlineReminders: [7, 3, 1],
    nudges: true,
    digestTime: '09:00',
    quietHours: null,
    timezone: 'Asia/Kolkata',
  },
  privacy: { sendResumeToAi: true },
  weights: { ...DEFAULT_WEIGHTS },
  updatedAt: ago(2),
};

export const state = {
  get signedIn(): boolean {
    const stored = read('beacon:mock:session');
    return stored === null ? scenario !== 'signed-out' && scenario !== 'new' : stored === '1';
  },
  set signedIn(value: boolean) {
    write('beacon:mock:session', value ? '1' : '0');
  },
  user,
  profile,
  settings,
  onboarding: {
    step: (scenario === 'new' ? 'consent' : 'done') as OnboardingStep,
    completedAt: scenario === 'new' ? null : ago(20),
    consent:
      scenario === 'new'
        ? null
        : { version: '2026-10-27', aiMode: 'beacon' as const, resumeToAi: true, at: ago(20) },
  } as MeResponse['onboarding'],
  tracker: [] as TrackerItemDTO[],
  alerts: [] as AlertRule[],
  notifications: [] as Notification[],
  push: [] as { id: string; endpoint: string; userAgent: string | null; createdAt: Date }[],
};

// Seed tracker items from the first few fixture listings.
const stages: TrackerStage[] = ['saved', 'saved', 'applied', 'applied', 'oa', 'interview', 'rejected'];
state.tracker = sampleListings.slice(0, stages.length).map((l, i) => {
  const stage = stages[i]!;
  return {
    id: `65f0c0ffee00000000${String(100 + i).padStart(6, '0')}`,
    userId: USER_ID,
    listingId: l.id,
    title: l.title.replace(/\p{Extended_Pictographic}\s*/gu, ''),
    company: l.company,
    type: l.type,
    applyUrl: l.applyUrl,
    deadlineAt: shift(l.deadlineAt),
    sourceId: l.sourceId,
    stage,
    position: stages.slice(0, i).filter((s) => s === stage).length,
    notes: '',
    contacts: [],
    documents: [],
    appliedAt: stage === 'saved' ? null : ago(12 - i),
    lastActivityAt: ago(i + 1),
    nudges: [],
    createdAt: ago(20 - i),
    updatedAt: ago(i + 1),
    history: [{ stage, at: ago(i + 1) }],
  };
});

state.alerts = [
  {
    id: '65f0c0ffee0000000000b001',
    userId: USER_ID,
    name: 'Strong fit internships',
    enabled: true,
    conditions: { minFit: 80, types: ['internship'], maxDeadlineDays: 14, locations: [], remote: 'any', keywords: [] },
    channels: ['inapp'],
    cadence: 'instant',
    digestTime: '09:00',
    digestDay: 1,
    quietHours: null,
    timezone: 'Asia/Kolkata',
    lastTriggeredAt: ago(1),
    createdAt: ago(15),
    updatedAt: ago(15),
  },
];

const first = sampleListings[0]!;
state.notifications = [
  {
    id: '65f0c0ffee0000000000c001',
    userId: USER_ID,
    kind: 'match',
    title: `Strong fit: ${first.title}`,
    body: `${first.company} · Fit 86`,
    url: null,
    listingId: first.id,
    trackerItemId: null,
    alertRuleId: '65f0c0ffee0000000000b001',
    channels: ['inapp'],
    readAt: null,
    createdAt: new Date(Date.now() - 2 * 3_600_000),
  },
  {
    id: '65f0c0ffee0000000000c002',
    userId: USER_ID,
    kind: 'deadline',
    title: `Closes tomorrow: ${sampleListings[1]!.title}`,
    body: `${sampleListings[1]!.company}. Fit 78.`,
    url: null,
    listingId: sampleListings[1]!.id,
    trackerItemId: null,
    alertRuleId: null,
    channels: ['inapp'],
    readAt: null,
    createdAt: new Date(Date.now() - 9 * 3_600_000),
  },
  {
    id: '65f0c0ffee0000000000c003',
    userId: USER_ID,
    kind: 'nudge',
    title: `No reply from ${sampleListings[2]!.company} in 10 days`,
    body: 'A short follow-up often gets one.',
    url: '/tracker',
    listingId: null,
    trackerItemId: state.tracker[2]?.id ?? null,
    alertRuleId: null,
    channels: ['inapp'],
    readAt: ago(1),
    createdAt: ago(2),
  },
];

export function meResponse(): MeResponse {
  const s = state.settings;
  return {
    user: state.user,
    onboarding: {
      ...state.onboarding,
      hasProfile: true,
      hasResume: state.onboarding.step !== 'consent',
      personalSources: 0,
      enabledPacks: ['top-indian-product', 'hackathons-india'],
    },
    settings: {
      theme: s.appearance.theme,
      density: s.appearance.density,
      accent: s.appearance.accent,
      fontSize: s.appearance.fontSize,
      reducedMotion: s.appearance.reducedMotion,
      aiEnabled: s.ai.enabled,
      aiProvider: s.ai.provider,
      hasKey: s.ai.hasKey,
      consentGivenAt: s.ai.consentGivenAt,
      pushEnabled: state.push.length > 0,
      timezone: s.notifications.timezone,
    },
    unreadNotifications: state.notifications.filter((n) => !n.readAt).length,
  };
}

let idCounter = 0xd000;
export function newId(): string {
  idCounter += 1;
  return `65f0c0ffee00000000${idCounter.toString(16).padStart(6, '0')}`;
}
