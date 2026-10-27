import { describe, expect, it } from 'vitest';

import { loadEnv } from './env.js';

describe('loadEnv', () => {
  it('applies defaults and treats empty strings as unset', () => {
    const env = loadEnv({ PORT: '', MONGODB_URI: '', LOG_LEVEL: 'debug' });
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      LOG_LEVEL: 'debug',
      MONGODB_DB: 'beacon',
    });
    expect(env.MONGODB_URI).toBeUndefined();
  });

  it('coerces PORT and rejects invalid values', () => {
    expect(loadEnv({ PORT: '8080' }).PORT).toBe(8080);
    expect(() => loadEnv({ PORT: 'abc' })).toThrow();
  });
});
