/**
 * Mint a session JWT for load and contract tests (never in production):
 *
 *   pnpm --filter @kestrel/api run dev:token -- --email load@beacon.test [--name "Load Test"] [--days 7]
 *
 * Creates or reuses the user (googleSub `dev:<email>`) in MONGODB_URI/MONGODB_DB and prints only
 * the token on stdout, so `TOKEN=$(pnpm -s --filter @kestrel/api run dev:token -- --email x@y)`
 * works. The token is signed with JWT_SECRET, which must match the running API.
 */
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { connectMongo, disconnectMongo } from '../db.js';
import { loadEnv, type Env } from '../env.js';
import { signSession, SESSION_TTL_SECONDS } from '../lib/jwt.js';
import { User, type UserDoc } from '../models/user.js';

export interface DevTokenOptions {
  email: string;
  name?: string;
  ttlSeconds?: number;
}

/** Upsert the dev user and sign a token for it. Requires an open Mongoose connection. */
export async function mintDevToken(env: Env, options: DevTokenOptions): Promise<{ token: string; user: UserDoc }> {
  if (env.NODE_ENV === 'production') throw new Error('dev:token is disabled when NODE_ENV=production');
  if (!env.JWT_SECRET) throw new Error('JWT_SECRET must be set (the same value the API runs with)');
  const email = options.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new Error(`Not an email address: ${options.email}`);
  const user = await User.findOneAndUpdate(
    { googleSub: `dev:${email}` },
    {
      $set: { lastLoginAt: new Date() },
      $setOnInsert: {
        googleSub: `dev:${email}`,
        email,
        name: options.name?.trim() || email.split('@')[0] || 'Dev user',
        onboardingStep: 'done',
        onboardingCompletedAt: new Date(),
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  ).lean<UserDoc>();
  if (!user) throw new Error('Could not create the dev user');
  const token = signSession(
    { sub: user._id.toString(), sv: user.sessionVersion ?? 0 },
    env.JWT_SECRET,
    options.ttlSeconds ?? SESSION_TTL_SECONDS,
  );
  return { token, user };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((a) => a !== '--'),
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      days: { type: 'string' },
    },
  });
  if (!values.email) throw new Error('Usage: dev:token -- --email <address> [--name <name>] [--days <n>]');
  const env = loadEnv();
  if (!env.MONGODB_URI) throw new Error('MONGODB_URI must be set');
  await connectMongo({ uri: env.MONGODB_URI, dbName: env.MONGODB_DB });
  try {
    const days = values.days ? Number(values.days) : 7;
    const { token, user } = await mintDevToken(env, {
      email: values.email,
      ...(values.name ? { name: values.name } : {}),
      ttlSeconds: Math.max(1, Math.round(days * 86_400)),
    });
    process.stderr.write(`user ${user._id.toString()} <${user.email}> in db ${env.MONGODB_DB}\n`);
    process.stdout.write(`${token}\n`);
  } finally {
    await disconnectMongo();
  }
}

const invoked = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invoked) {
  main().catch((err: unknown) => {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(1);
  });
}
