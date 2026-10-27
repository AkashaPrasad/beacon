import { Router } from 'express';
import { z } from 'zod';

import { GoogleAuthError, type GoogleIdentity } from '../auth/google.js';
import type { AppContext } from '../context.js';
import { HttpError } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { clearSessionCookie, currentUser, requireAuth, setSessionCookie } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { Notification, Subscription } from '../models/activity.js';
import { Profile } from '../models/profile.js';
import { Settings } from '../models/settings.js';
import { Source } from '../models/source.js';
import { User, type UserDoc } from '../models/user.js';
import { googleAuthSchema, mePatchSchema } from '../schemas/index.js';
import { toPublicUser } from '../services/serialize.js';
import { getSettings } from '../services/settings.js';

/** Redirect URIs the auth-code flow may use (must also be registered in the Google console). */
export function allowedRedirectUris(ctx: AppContext): string[] {
  const web = ctx.env.WEB_URL.replace(/\/+$/, '');
  return [...new Set([`${web}/auth/callback`, 'http://localhost:5173/auth/callback', 'http://localhost:4173/auth/callback'])];
}

function assertRedirectUri(ctx: AppContext, redirectUri: string): void {
  if (!allowedRedirectUris(ctx).includes(redirectUri)) {
    throw new HttpError(400, 'BAD_REQUEST', 'redirectUri is not an allowed callback URL', {
      allowed: allowedRedirectUris(ctx),
    });
  }
}

const authUrlQuerySchema = z.object({
  state: z.string().max(512).optional(),
  redirectUri: z.string().max(2_048).optional(),
});

async function identify(ctx: AppContext, body: unknown): Promise<GoogleIdentity> {
  const input = parse(googleAuthSchema, body);
  if ('code' in input) assertRedirectUri(ctx, input.redirectUri);
  try {
    const identity =
      'credential' in input
        ? await ctx.google.verifyIdToken(input.credential)
        : await ctx.google.exchangeCode(input.code, input.redirectUri);
    if (!identity.emailVerified) {
      throw new HttpError(401, 'INVALID_GOOGLE_TOKEN', 'Your Google email address is not verified');
    }
    return identity;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    ctx.logger.info({ err: (err as Error).message }, 'google sign-in rejected');
    throw new HttpError(
      401,
      'INVALID_GOOGLE_TOKEN',
      err instanceof GoogleAuthError && /not configured/.test(err.message)
        ? 'Google sign-in is not configured on this server'
        : 'Google sign-in could not be verified',
    );
  }
}

export async function buildMe(ctx: AppContext, user: UserDoc) {
  const [profile, settings, personalSources, packIds, unread] = await Promise.all([
    Profile.findOne({ userId: user._id }, { resume: 1 }).lean<{ resume?: unknown }>(),
    getSettings(user._id),
    Source.countDocuments({ scope: 'personal', ownerId: user._id }),
    Subscription.find({ userId: user._id, packId: { $ne: null } }).distinct('packId'),
    Notification.countDocuments({ userId: user._id, readAt: null }),
  ]);
  return {
    user: toPublicUser(user),
    onboarding: {
      step: user.onboardingStep ?? 'consent',
      completedAt: user.onboardingCompletedAt ?? null,
      consent: user.consent ?? null,
      hasProfile: Boolean(profile),
      hasResume: Boolean(profile?.resume),
      personalSources,
      enabledPacks: (packIds as string[]).filter(Boolean).sort(),
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

export function createAuthRouter(ctx: AppContext): Router {
  const router = Router();
  const authLimiter = createRateLimiter('auth', ctx.rateLimits.auth, ctx.redis, 'ip');

  router.post('/auth/google', authLimiter, async (req, res) => {
    const identity = await identify(ctx, req.body);
    const now = ctx.now();
    const existing = await User.findOne({ googleSub: identity.sub }, { _id: 1 }).lean();
    const user = await User.findOneAndUpdate(
      { googleSub: identity.sub },
      {
        $set: {
          email: identity.email.toLowerCase(),
          name: identity.name?.trim() || identity.email.split('@')[0] || 'Beacon user',
          avatarUrl: identity.picture ?? null,
          lastLoginAt: now,
        },
        $setOnInsert: { googleSub: identity.sub },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    ).lean<UserDoc>();
    if (!user) throw new HttpError(500, 'INTERNAL', 'Could not create the user');
    setSessionCookie(ctx, res, user);
    res.json({ user: toPublicUser(user), isNew: !existing });
  });

  router.get('/auth/google/url', (req, res) => {
    const q = parse(authUrlQuerySchema, req.query, 'query');
    const redirectUri = q.redirectUri ?? allowedRedirectUris(ctx)[0]!;
    assertRedirectUri(ctx, redirectUri);
    let url: string;
    try {
      url = ctx.google.authUrl(redirectUri, q.state);
    } catch {
      throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Google sign-in is not configured on this server');
    }
    res.json({ url, redirectUri });
  });

  router.post('/auth/logout', (_req, res) => {
    clearSessionCookie(ctx, res);
    res.status(204).end();
  });

  router.get('/me', requireAuth(ctx), async (req, res) => {
    res.json(await buildMe(ctx, currentUser(req).doc));
  });

  router.patch('/me', requireAuth(ctx), async (req, res) => {
    const { _id } = currentUser(req);
    const body = parse(mePatchSchema, req.body);
    const now = ctx.now();
    const set: Record<string, unknown> = {};
    if (body.name !== undefined) set['name'] = body.name;
    if (body.onboardingStep !== undefined) set['onboardingStep'] = body.onboardingStep;
    if (body.onboardingCompleted !== undefined) {
      set['onboardingCompletedAt'] = body.onboardingCompleted ? now : null;
      if (body.onboardingCompleted) set['onboardingStep'] = 'done';
    }
    if (body.consent) {
      set['consent'] = { ...body.consent, at: now };
      await getSettings(_id);
      await Settings.updateOne(
        { userId: _id },
        {
          $set: {
            'ai.enabled': body.consent.aiMode !== 'off',
            'ai.consentGivenAt': body.consent.aiMode === 'beacon' && body.consent.resumeToAi ? now : null,
            'privacy.sendResumeToAi': body.consent.resumeToAi,
            ...(body.consent.aiMode === 'beacon' ? { 'ai.provider': 'default' } : {}),
          },
        },
      );
    }
    const user = await User.findByIdAndUpdate(_id, { $set: set }, { returnDocument: 'after' }).lean<UserDoc>();
    if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Your session is no longer valid', { reason: 'revoked' });
    res.json(await buildMe(ctx, user));
  });

  return router;
}
