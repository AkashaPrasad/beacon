import type { mongo } from 'mongoose';

import { ListingModel } from './listing.js';
import { ExplanationModel, MatchModel } from './match.js';
import { NotificationModel } from './notification.js';
import { SourceModel, SourceRunModel } from './source.js';
import {
  AlertRuleModel,
  InteractionModel,
  ProfileModel,
  PushSubscriptionModel,
  SettingsModel,
  SubscriptionModel,
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
  SubscriptionModel,
  InteractionModel,
  ExplanationModel,
] as const;

/** MongoDB: same index name or key pattern already exists with different options. */
const INDEX_CONFLICT_CODES = new Set([85, 86]);

/**
 * Builds the indexes the worker declares, one at a time. A conflicting index that already
 * exists (created by the API or an older build) is reported, not fatal, and nothing is
 * dropped: the API declares indexes on the same collections (`syncIndexes` would remove them).
 */
export async function ensureWorkerIndexes(onConflict: (message: string) => void = () => undefined): Promise<void> {
  for (const model of WORKER_OWNED_MODELS) {
    for (const [keys, options] of model.schema.indexes()) {
      try {
        await model.collection.createIndex(keys as Record<string, 1 | -1>, options as mongo.CreateIndexesOptions);
      } catch (err) {
        const code = (err as { code?: number }).code;
        if (code === undefined || !INDEX_CONFLICT_CODES.has(code)) throw err;
        onConflict(`${model.collection.collectionName} ${JSON.stringify(keys)}: ${(err as Error).message}`);
      }
    }
  }
}
