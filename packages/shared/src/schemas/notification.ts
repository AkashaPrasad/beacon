import { z } from 'zod';

import { NOTIFICATION_KINDS } from '../constants';
import { alertChannelSchema } from './alert';
import { dateSchema, idSchema, nonEmptyTrimmed } from './common';

export const notificationKindSchema = z.enum(NOTIFICATION_KINDS);

export const notificationSchema = z.object({
  id: idSchema,
  userId: idSchema,
  kind: notificationKindSchema,
  title: nonEmptyTrimmed(200),
  body: z.string().max(2_000).default(''),
  /** In-app deep link, e.g. "/radar?listing=<id>". */
  url: z.string().max(2048).nullable().default(null),
  listingId: idSchema.nullable().default(null),
  trackerItemId: idSchema.nullable().default(null),
  alertRuleId: idSchema.nullable().default(null),
  /** Channels this notification was delivered on. */
  channels: z.array(alertChannelSchema).default(['inapp']),
  readAt: dateSchema.nullable().default(null),
  createdAt: dateSchema,
});
export type Notification = z.infer<typeof notificationSchema>;
