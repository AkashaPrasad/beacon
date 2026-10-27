import { createApp } from './app.js';
import { createContext } from './context.js';
import { connectMongo, disconnectMongo } from './db.js';
import { loadEnv } from './env.js';
import { createBullQueue } from './lib/queues.js';
import { createRedis } from './lib/redis.js';
import { configureVector } from './lib/vector.js';
import { createLogger } from './logger.js';
import { ensureIndexes } from './models/index.js';
import { seedCommunitySources } from './seed/packs.js';
import { seedAdmin } from './services/admin.js';

const env = loadEnv();
const logger = createLogger({ level: env.LOG_LEVEL, pretty: env.NODE_ENV === 'development' });

const redis = createRedis(env.REDIS_URL, logger);
const queue = createBullQueue(env.REDIS_URL, logger);
configureVector({ mode: env.VECTOR_SEARCH, logger });

if (env.MONGODB_URI) {
  try {
    await connectMongo({ uri: env.MONGODB_URI, dbName: env.MONGODB_DB });
    logger.info({ db: env.MONGODB_DB }, 'mongo connected');
    // Indexes first (the users index migration must run before the admin upsert).
    void ensureIndexes()
      .then((dropped) => logger.info({ dropped }, 'mongo indexes ensured'))
      .catch((err: unknown) => logger.warn({ err: (err as Error).message }, 'index build failed'))
      .then(() => seedAdmin(env, env.PASSWORD_HASH_COST, logger))
      .catch((err: unknown) => logger.warn({ err: (err as Error).message }, 'admin seeding failed'));
    if (env.SEED_SOURCES) {
      void seedCommunitySources(logger).catch((err: unknown) =>
        logger.warn({ err: (err as Error).message }, 'community source seeding failed'),
      );
    }
  } catch (err) {
    logger.error({ err }, 'mongo connection failed; /readyz will report not ready');
  }
} else {
  logger.warn('MONGODB_URI not set; running without a database');
}

const ctx = createContext({ env, logger, redis, queue });
const app = createApp(ctx);
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, vectorSearch: env.VECTOR_SEARCH }, 'beacon api listening');
});

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, 'shutting down');
  server.close(() => {
    void Promise.allSettled([queue.close(), redis.quit(), disconnectMongo()]).finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
