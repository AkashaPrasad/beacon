import { type Logger, pino } from 'pino';

export type { Logger };

export function createLogger(level: string, pretty = false): Logger {
  return pino({
    level,
    base: { service: 'worker' },
    redact: {
      paths: ['*.apiKey', '*.authorization', '*.Authorization', 'headers.authorization', '*.keys'],
      censor: '[redacted]',
    },
    ...(pretty ? { transport: { target: 'pino-pretty' } } : {}),
  });
}

/** Silent logger for tests and library defaults. */
export const nullLogger: Logger = pino({ level: 'silent' });
