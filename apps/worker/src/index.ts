import { buildWorker } from './app.js';
import { loadEnv } from './env.js';
import { createLogger } from './logger.js';

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV === 'development');
const app = buildWorker(env, logger);

let stopping = false;
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (stopping) return;
  stopping = true;
  const started = Date.now();
  logger.info({ signal }, 'shutting down (draining active jobs)');
  setTimeout(() => {
    logger.error({ ms: Date.now() - started }, 'shutdown timed out; exiting');
    process.exit(1);
  }, 25_000).unref();
  try {
    await app.stop();
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, 'shutdown failed');
    process.exit(1);
  }
  logger.info({ ms: Date.now() - started }, 'shutdown complete');
  process.exit(0);
}

process.on('unhandledRejection', (err) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'unhandled rejection');
});

process.on('SIGTERM', (signal) => void shutdown(signal));
process.on('SIGINT', (signal) => void shutdown(signal));

app.start().catch((err: unknown) => {
  logger.fatal({ err: err instanceof Error ? err.message : String(err) }, 'worker failed to start');
  process.exit(1);
});
