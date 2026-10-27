import { z } from 'zod';

import { dateSchema, httpUrlSchema, idSchema } from './common';

export const USER_ROLES = ['user', 'admin'] as const;

export const userSchema = z.object({
  id: idSchema,
  email: z.email().max(320),
  name: z.string().trim().min(1).max(120),
  avatarUrl: httpUrlSchema.nullable().default(null),
  /** Google account subject id (`sub` claim). Never exposed to other users. */
  googleSub: z.string().min(1).max(255),
  role: z.enum(USER_ROLES).default('user'),
  onboardingCompletedAt: dateSchema.nullable().default(null),
  lastLoginAt: dateSchema.nullable().default(null),
  createdAt: dateSchema,
  updatedAt: dateSchema,
});
export type User = z.infer<typeof userSchema>;

/** What `GET /me` returns: the user without the Google subject id. */
export const publicUserSchema = userSchema.omit({ googleSub: true });
export type PublicUser = z.infer<typeof publicUserSchema>;
