import { ListingModel } from './listing.js';
import { ExplanationModel, MatchModel } from './match.js';
import { NotificationModel } from './notification.js';
import { SourceModel, SourceRunModel } from './source.js';
import {
  AlertRuleModel,
  ProfileModel,
  PushSubscriptionModel,
  SettingsModel,
  TrackerItemModel,
  UserModel,
} from './user-data.js';

export * from './listing.js';
export * from './match.js';
export * from './notification.js';
export * from './source.js';
export * from './user-data.js';

/** Collections whose indexes the worker owns (it writes them). API-owned ones are left alone. */
export const WORKER_OWNED_MODELS = [ListingModel, MatchModel, NotificationModel, SourceRunModel] as const;

export const ALL_MODELS = [
  ...WORKER_OWNED_MODELS,
  SourceModel,
  UserModel,
  ProfileModel,
  SettingsModel,
  TrackerItemModel,
  AlertRuleModel,
  PushSubscriptionModel,
  ExplanationModel,
] as const;

export async function ensureWorkerIndexes(): Promise<void> {
  await Promise.all(WORKER_OWNED_MODELS.map((m) => m.createIndexes()));
}
