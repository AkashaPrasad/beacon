import type { Types } from 'mongoose';

import {
  normaliseWeights,
  SCORE_COMPONENTS,
  type FitResult,
  type ListingPublic,
  type ScoreComponent,
} from '@kestrel/shared';

import type {
  AlertRuleDoc,
  MatchDoc,
  NotificationDoc,
  PushSubscriptionDoc,
  TrackerItemDoc,
} from '../models/activity.js';
import type { ListingDoc } from '../models/listing.js';
import type { SettingsDoc } from '../models/settings.js';
import type { SourceDoc } from '../models/source.js';
import type { UserDoc } from '../models/user.js';

const idOf = (value: Types.ObjectId | null | undefined): string | null => (value ? value.toString() : null);

export function toPublicUser(doc: UserDoc) {
  return {
    id: doc._id.toString(),
    email: doc.email,
    name: doc.name,
    avatarUrl: doc.avatarUrl ?? null,
    role: doc.role ?? 'user',
    authMethods: { google: Boolean(doc.googleSub), password: Boolean(doc.passwordHash) },
    onboardingCompletedAt: doc.onboardingCompletedAt ?? null,
    lastLoginAt: doc.lastLoginAt ?? null,
    lastSeenFeedAt: doc.lastSeenFeedAt ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function toSourceDTO(doc: SourceDoc) {
  return {
    id: doc._id.toString(),
    url: doc.url,
    name: doc.name,
    kind: doc.kind,
    scope: doc.scope,
    ownerId: idOf(doc.ownerId),
    packId: doc.packId ?? null,
    packIds: doc.packIds ?? (doc.packId ? [doc.packId] : []),
    typeTag: doc.typeTag ?? null,
    enabled: doc.enabled,
    refreshInterval: doc.refreshInterval,
    health: doc.health,
    healthCode: doc.healthCode ?? null,
    lastCheckedAt: doc.lastCheckedAt ?? null,
    lastSuccessAt: doc.lastSuccessAt ?? null,
    consecutiveFailures: doc.consecutiveFailures ?? 0,
    listingsFound: doc.listingsFound ?? 0,
    errorReason: doc.errorReason ?? null,
    config: {
      boardToken: doc.config?.boardToken ?? null,
      feedUrl: doc.config?.feedUrl ?? null,
      provider: doc.config?.provider ?? null,
    },
    etag: doc.etag ?? null,
    lastModified: doc.lastModified ?? null,
    companyDomain: doc.companyDomain ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
export type SourceDTO = ReturnType<typeof toSourceDTO>;

export const FEED_DESCRIPTION_CHARS = 500;

export function toListingPublic(doc: ListingDoc, options: { descriptionChars?: number } = {}): ListingPublic {
  const { descriptionChars } = options;
  const description = doc.descriptionMd ?? '';
  return {
    id: doc._id.toString(),
    type: doc.type,
    title: doc.title,
    company: doc.company,
    companyDomain: doc.companyDomain ?? null,
    location: doc.location ?? [],
    remote: doc.remote ?? 'unknown',
    country: doc.country ?? null,
    stipendMin: doc.stipendMin ?? null,
    stipendMax: doc.stipendMax ?? null,
    currency: doc.currency ?? null,
    period: doc.period ?? null,
    postedAt: doc.postedAt ?? null,
    deadlineAt: doc.deadlineAt ?? null,
    eligibility: {
      gradYears: doc.eligibility?.gradYears ?? [],
      degrees: doc.eligibility?.degrees ?? [],
      minExperienceYears: doc.eligibility?.minExperienceYears ?? null,
      citizenship: doc.eligibility?.citizenship ?? [],
      other: doc.eligibility?.other ?? [],
    },
    skillsRequired: doc.skillsRequired ?? [],
    skillsNice: doc.skillsNice ?? [],
    descriptionMd:
      descriptionChars === undefined
        ? description
        : description.length > descriptionChars
          ? `${description.slice(0, descriptionChars).trimEnd()}…`
          : description,
    applyUrl: doc.applyUrl,
    sourceId: doc.sourceId.toString(),
    canonicalKey: doc.canonicalKey,
    firstSeenAt: doc.firstSeenAt,
    lastSeenAt: doc.lastSeenAt,
    seenCount: doc.seenCount ?? 1,
    ghostRisk: { score: doc.ghostRisk?.score ?? 0, reasons: doc.ghostRisk?.reasons ?? [] },
    deadlineKind: doc.deadlineKind ?? 'unknown',
    archived: doc.archived ?? false,
    roleFamily: doc.roleFamily ?? null,
  };
}

function componentRecord(source: Partial<Record<ScoreComponent, number>> | undefined): Record<ScoreComponent, number> {
  return Object.fromEntries(SCORE_COMPONENTS.map((c) => [c, source?.[c] ?? 0])) as Record<ScoreComponent, number>;
}

/** Match doc (worker) → full `FitResult`, filling any field the worker did not write. */
export function toFitResult(match: MatchDoc): FitResult {
  return {
    score: Math.round(match.score),
    rawScore: match.rawScore ?? match.score,
    components: componentRecord(match.components),
    contributions: componentRecord(match.contributions),
    weights: match.weights ? componentRecord(match.weights) : normaliseWeights(),
    caps: match.caps ?? [],
    ghostPenalty: match.ghostPenalty ?? 0,
    hardFails: match.hardFails ?? [],
    semanticAvailable: match.semanticAvailable ?? false,
    details: {
      skills: {
        matchedRequired: match.details?.skills?.matchedRequired ?? [],
        missingRequired: match.details?.skills?.missingRequired ?? [],
        matchedNice: match.details?.skills?.matchedNice ?? [],
        missingNice: match.details?.skills?.missingNice ?? [],
      },
      roleFamily: match.details?.roleFamily ?? null,
    },
    explain: { whyFit: match.explain?.whyFit ?? [], gaps: match.explain?.gaps ?? [] },
  };
}

export function toTrackerDTO(doc: TrackerItemDoc) {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    listingId: idOf(doc.listingId),
    title: doc.title,
    company: doc.company,
    type: doc.type ?? null,
    applyUrl: doc.applyUrl ?? null,
    deadlineAt: doc.deadlineAt ?? null,
    sourceId: idOf(doc.sourceId),
    stage: doc.stage,
    position: doc.position,
    notes: doc.notes ?? '',
    contacts: doc.contacts ?? [],
    documents: doc.documents ?? [],
    appliedAt: doc.appliedAt ?? null,
    lastActivityAt: doc.lastActivityAt,
    nudges: doc.nudges ?? [],
    history: doc.history ?? [],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function toAlertDTO(doc: AlertRuleDoc) {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    name: doc.name,
    enabled: doc.enabled,
    conditions: doc.conditions,
    channels: doc.channels,
    cadence: doc.cadence,
    digestTime: doc.digestTime,
    digestDay: doc.digestDay,
    quietHours: doc.quietHours ?? null,
    timezone: doc.timezone,
    lastTriggeredAt: doc.lastTriggeredAt ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function toNotificationDTO(doc: NotificationDoc) {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    kind: doc.kind,
    title: doc.title,
    body: doc.body ?? '',
    url: doc.url ?? null,
    listingId: idOf(doc.listingId),
    trackerItemId: idOf(doc.trackerItemId),
    alertRuleId: idOf(doc.alertRuleId),
    channels: doc.channels ?? ['inapp'],
    readAt: doc.readAt ?? null,
    createdAt: doc.createdAt,
  };
}

export function toPushDTO(doc: PushSubscriptionDoc) {
  return {
    id: doc._id.toString(),
    endpoint: doc.endpoint,
    userAgent: doc.userAgent ?? null,
    createdAt: doc.createdAt,
  };
}

export function toAiSettingsDTO(ai: SettingsDoc['ai']) {
  return {
    provider: ai.provider ?? 'default',
    baseUrl: ai.baseUrl ?? null,
    model: ai.model ?? null,
    hasKey: Boolean(ai.keyCiphertext),
    keyLast4: ai.keyCiphertext ? (ai.keyLast4 ?? null) : null,
    enabled: ai.enabled ?? true,
    consentGivenAt: ai.consentGivenAt ?? null,
  };
}

export function toSettingsDTO(doc: SettingsDoc) {
  return {
    userId: doc.userId.toString(),
    appearance: { ...doc.appearance },
    ai: toAiSettingsDTO(doc.ai),
    notifications: {
      push: doc.notifications.push,
      inapp: doc.notifications.inapp,
      deadlineReminders: doc.notifications.deadlineReminders,
      nudges: doc.notifications.nudges,
      digestTime: doc.notifications.digestTime,
      quietHours: doc.notifications.quietHours ?? null,
      timezone: doc.notifications.timezone,
    },
    privacy: { sendResumeToAi: doc.privacy?.sendResumeToAi ?? false },
    weights: doc.weights,
    updatedAt: doc.updatedAt,
  };
}
