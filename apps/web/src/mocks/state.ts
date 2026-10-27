/**
 * Shared mock state for MSW (`VITE_MOCK_API=1` and Vitest): the session, the user and onboarding
 * progress, plus the resources several handlers read together (settings, profile, notifications,
 * tracker and alerts for the export, push subscriptions). Feature handler modules own the behaviour
 * (`src/mocks/handlers/<feature>.ts`) and may keep extra private state. Everything is fictional
 * (from @kestrel/shared/fixtures), with dates shifted so the fixture clock reads as "now".
 *
 * Scenario (read at load; flip it with localStorage, then reload):
 *   localStorage['beacon:mock:user'] = 'returning' (default: signed in, onboarded)
 *                                    | 'admin' (the same, with role admin: /admin works)
 *                                    | 'new' (signed out; signing in lands on consent)
 *                                    | 'consent' (signed in, consent not given yet)
 *                                    | 'signed-out' (returning account, signed out)
 *   localStorage['beacon:mock:session'] = '1' | '0' overrides the signed-in state (sign-in/out write it).
 */
import type { MeResponse, OnboardingStep, PushSubscriptionDTO, TrackerItemDTO } from '@/api/types';
import {
  DEFAULT_WEIGHTS,
  type AlertRule,
  type Notification,
  type Profile,
  type Settings,
  type TrackerStage,
} from '@kestrel/shared';
import { FIXTURE_NOW, sampleListings, sampleProfiles } from '@kestrel/shared/fixtures';

const SHIFT = Date.now() - FIXTURE_NOW.getTime();
export const shift = (d: Date | null | undefined): Date | null =>
  d ? new Date(d.getTime() + SHIFT) : null;
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
    /* storage blocked: state lives for this page only */
  }
}

export type MockUserScenario = 'returning' | 'admin' | 'new' | 'consent' | 'signed-out';

function readScenario(): MockUserScenario {
  const value = read('beacon:mock:user');
  return value === 'admin' || value === 'new' || value === 'consent' || value === 'signed-out' ? value : 'returning';
}

export const MOCK_USER_ID = '65f0c0ffee0000000000a001';
export const CONSENT_VERSION_MOCK = '2026-10-27';

function seedSettings(): Settings {
  return {
    userId: MOCK_USER_ID,
    appearance: {
      theme: 'system',
      accent: 'default',
      density: 'comfortable',
      fontSize: 'md',
      reducedMotion: 'system',
    },
    ai: {
      provider: 'default',
      baseUrl: null,
      model: null,
      hasKey: false,
      keyLast4: null,
      enabled: true,
      consentGivenAt: ago(20),
    },
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
}

function seedTracker(): TrackerItemDTO[] {
  const stages: TrackerStage[] = [
    'saved',
    'saved',
    'applied',
    'applied',
    'oa',
    'interview',
    'rejected',
  ];
  return sampleListings.slice(0, stages.length).map((l, i) => {
    const stage = stages[i] ?? 'saved';
    return {
      id: `65f0c0ffee00000000${String(100 + i).padStart(6, '0')}`,
      userId: MOCK_USER_ID,
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
}

function seedAlerts(): AlertRule[] {
  return [
    {
      id: '65f0c0ffee0000000000b001',
      userId: MOCK_USER_ID,
      name: 'Strong fit internships',
      enabled: true,
      conditions: {
        minFit: 80,
        types: ['internship'],
        maxDeadlineDays: 14,
        locations: [],
        remote: 'any',
        keywords: [],
      },
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
}

function createState() {
  const scenario = readScenario();
  const fresh = scenario === 'new' || scenario === 'consent';
  let memorySession: boolean | null = null;
  const step: OnboardingStep = fresh ? 'consent' : 'done';
  const onboarding: Pick<MeResponse['onboarding'], 'step' | 'completedAt' | 'consent'> = {
    step,
    completedAt: fresh ? null : ago(20),
    consent: fresh
      ? null
      : { version: CONSENT_VERSION_MOCK, aiMode: 'beacon', resumeToAi: true, at: ago(20) },
  };
  return {
    scenario,
    get signedIn(): boolean {
      const stored =
        read('beacon:mock:session') ?? (memorySession === null ? null : memorySession ? '1' : '0');
      return stored === null
        ? scenario === 'returning' || scenario === 'admin' || scenario === 'consent'
        : stored === '1';
    },
    set signedIn(value: boolean) {
      memorySession = value;
      write('beacon:mock:session', value ? '1' : '0');
    },
    user: {
      id: MOCK_USER_ID,
      email: 'aarav.mehta@example.com',
      name: 'Aarav Mehta',
      avatarUrl: null,
      role: (scenario === 'admin' ? 'admin' : 'user') as 'user' | 'admin',
      onboardingCompletedAt: fresh ? null : ago(20),
      lastLoginAt: ago(1),
      createdAt: fresh ? new Date() : ago(30),
      updatedAt: ago(1),
      lastSeenFeedAt: fresh ? null : ago(5),
    },
    onboarding,
    profile: { ...(sampleProfiles[0] as Profile), userId: MOCK_USER_ID },
    settings: seedSettings(),
    /** Filled by the notifications handler on first use (it owns the seed). */
    notifications: [] as Notification[],
    tracker: seedTracker(),
    alerts: seedAlerts(),
    push: [] as PushSubscriptionDTO[],
  };
}

export let state = createState();

/** Back to the scenario's initial state (tests). */
export function resetFoundationState(): void {
  write('beacon:mock:session', null);
  state = createState();
}

let idCounter = 0xd000;
export function newId(): string {
  idCounter += 1;
  return `65f0c0ffee00000000${idCounter.toString(16).padStart(6, '0')}`;
}
