import { pino, type Logger } from 'pino';

export type { Logger };

export function createLogger(options: { level: string; pretty?: boolean }): Logger {
  return pino({
    level: options.level,
    base: { service: 'beacon-api' },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.password',
        '*.apiKey',
        '*.token',
        '*.credential',
        '*.keyCiphertext',
      ],
      censor: '[redacted]',
    },
    ...(options.pretty ? { transport: { target: 'pino-pretty' } } : {}),
  });
}
