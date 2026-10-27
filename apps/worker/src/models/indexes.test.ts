import { describe, expect, it } from 'vitest';

import { ensureWorkerIndexes, NotificationModel } from './index.js';
import { useMongo } from '../test/mongo.js';


useMongo();

describe('ensureWorkerIndexes', () => {
  it('reports an index that exists with different options instead of failing boot, and drops nothing', async () => {
    const coll = NotificationModel.collection;
    await coll.dropIndex('userId_1_dedupeKey_1');
    // An older build created it without the partial filter.
    await coll.createIndex({ userId: 1, dedupeKey: 1 }, { unique: true, name: 'userId_1_dedupeKey_1' });
    await coll.createIndex({ apiOnly: 1 });
    const conflicts: string[] = [];
    await ensureWorkerIndexes((m) => conflicts.push(m));
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toContain('notifications');
    const names = (await coll.indexes()).map((i) => i.name);
    expect(names).toEqual(expect.arrayContaining(['apiOnly_1', 'userId_1_dedupeKey_1', 'userId_1_createdAt_-1']));
  });
});
