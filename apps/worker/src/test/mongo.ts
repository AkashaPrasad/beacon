import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { ensureWorkerIndexes } from '../models/index.js';

/** Starts an in-memory mongod for the test file and clears collections between tests. */
export function useMongo(): void {
  let server: MongoMemoryServer | undefined;
  beforeAll(async () => {
    server = await MongoMemoryServer.create();
    mongoose.set('strictQuery', true);
    await mongoose.connect(server.getUri(), { dbName: 'beacon_test', autoIndex: false });
    await ensureWorkerIndexes();
  }, 120_000);
  afterEach(async () => {
    const collections = await mongoose.connection.db?.collections();
    await Promise.all((collections ?? []).map((c) => c.deleteMany({})));
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await server?.stop();
  });
}
