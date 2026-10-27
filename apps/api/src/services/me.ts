/** `MeResponse` (GET/PATCH /v1/me and the onboarding endpoints): user, onboarding, settings summary. */
import type { AppContext } from '../context.js';
import { toPublicUser } from './serialize.js';
import { getSettings } from './settings.js';
import { Notification, Subscription } from '../models/activity.js';
import { Profile } from '../models/profile.js';
import { Source } from '../models/source.js';
import type { UserDoc } from '../models/user.js';

export async function buildMe(_ctx: AppContext, user: UserDoc) {
  const [profile, settings, personalSources, packIds, unread] = await Promise.all([
    Profile.findOne({ userId: user._id }, { resume: 1 }).lean<{ resume?: unknown }>(),
    getSettings(user._id),
    Source.countDocuments({ scope: 'personal', ownerId: user._id }),
    Subscription.find({ userId: user._id, packId: { $ne: null } }).distinct('packId'),
    Notification.countDocuments({ userId: user._id, readAt: null }),
  ]);
  const completedAt = user.onboardingCompletedAt ?? null;
  return {
    user: toPublicUser(user),
    onboarding: {
      completed: completedAt !== null,
      step: user.onboardingStep ?? 'consent',
      answers: (user.onboardingAnswers ?? {}),
      updatedAt: user.onboardingUpdatedAt ?? null,
      completedAt,
      consent: user.consent ?? null,
      hasProfile: Boolean(profile),
      hasResume: Boolean(profile?.resume),
      personalSources,
      enabledPacks: packIds.filter(Boolean).sort(),
    },
    settings: {
      theme: settings.appearance.theme,
      density: settings.appearance.density,
      accent: settings.appearance.accent,
      fontSize: settings.appearance.fontSize,
      reducedMotion: settings.appearance.reducedMotion,
      aiEnabled: settings.ai.enabled,
      aiProvider: settings.ai.provider,
      hasKey: Boolean(settings.ai.keyCiphertext),
      consentGivenAt: settings.ai.consentGivenAt ?? null,
      pushEnabled: settings.notifications.push,
      timezone: settings.notifications.timezone,
    },
    unreadNotifications: unread,
  };
}
