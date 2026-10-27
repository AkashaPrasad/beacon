import { randomBytes } from 'node:crypto';

import mongoose from 'mongoose';
import nock from 'nock';
import { afterAll, afterEach, beforeAll, inject } from 'vitest';

import { ensureIndexes } from '../models/index.js';

beforeAll(async () => {
  nock.disableNetConnect();
  nock.enableNetConnect((host) => host.startsWith('127.0.0.1') || host.startsWith('localhost'));
  await mongoose.connect(inject('mongoUri'), { dbName: `t_${randomBytes(6).toString('hex')}` });
  await ensureIndexes();
});

afterEach(() => {
  nock.cleanAll();
});

afterAll(async () => {
  await mongoose.connection.dropDatabase().catch(() => undefined);
  await mongoose.disconnect();
  nock.enableNetConnect();
});
