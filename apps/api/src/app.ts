import { randomUUID } from 'node:crypto';

import {
  OPPORTUNITY_TYPE_LABELS,
  OPPORTUNITY_TYPES,
  SOURCE_KIND_LABELS,
  SOURCE_KINDS,
  TRACKER_STAGE_LABELS,
  TRACKER_STAGES,
} from '@kestrel/shared';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router, type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { createContext, type AppContext, type ContextInput } from './context.js';
import { csrfGuard, requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { DOCS_HTML, openApiDocument } from './openapi.js';
import { createAlertsRouter, createPublicPushRouter } from './routes/alerts.js';
import { createAuthRouter } from './routes/auth.js';
import { createFeedRouter } from './routes/feed.js';
import { createProfileRouter } from './routes/profile.js';
import { createSettingsRouter } from './routes/settings.js';
import { createSourcesRouter } from './routes/sources.js';
import { createTrackerRouter } from './routes/tracker.js';
import { loadPacks } from './seed/packs.js';

export const API_VERSION = '1.0.0';

export function allowedOrigins(webUrl: string): string[] {
  const origins = new Set([new URL(webUrl).origin, 'http://localhost:5173']);
  return [...origins];
}

export function createApp(input: ContextInput | AppContext): Express {
  const ctx = createContext(input);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', ctx.env.TRUST_PROXY);
  app.set('query parser', 'simple');

  app.use(
    pinoHttp({
      logger: ctx.logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && /^[\w-]{1,100}$/.test(incoming) ? incoming : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/healthz' || req.url === '/readyz' },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    }),
  );
  app.use(
    '/docs',
    helmet({
      contentSecurityPolicy: {
        directives: {
          'script-src': ["'self'", 'https://cdn.jsdelivr.net', "'unsafe-inline'"],
          'style-src': ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'data:', 'https://cdn.jsdelivr.net', 'https://fonts.gstatic.com'],
          'connect-src': ["'self'"],
          'img-src': ["'self'", 'data:', 'https:'],
          'worker-src': ["'self'", 'blob:'],
        },
      },
    }),
  );
  const defaultHelmet = helmet({ crossOriginResourcePolicy: { policy: 'same-site' } });
  app.use((req, res, next) => (req.path === '/docs' ? next() : defaultHelmet(req, res, next)));
  app.use(
    cors({
      origin: allowedOrigins(ctx.env.WEB_URL),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-Requested-With', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['RateLimit', 'RateLimit-Policy', 'Retry-After', 'X-Request-Id', 'Content-Disposition'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/readyz', async (_req, res) => {
    const { mongo, redis } = await ctx.readiness();
    const ok = mongo && redis;
    res.status(ok ? 200 : 503).json({ ok, mongo: mongo ? 'up' : 'down', redis: redis ? 'up' : 'down' });
  });

  app.use(createRateLimiter('global', ctx.rateLimits.global, ctx.redis, 'ip'));

  app.get('/openapi.json', (_req, res) => {
    res.json(openApiDocument(ctx.env.API_URL));
  });
  app.get('/docs', (_req, res) => {
    res.type('html').send(DOCS_HTML);
  });

  const v1 = Router();
  v1.use(csrfGuard);
  v1.get('/meta', (_req, res) => {
    res.json({
      name: 'beacon',
      version: API_VERSION,
      opportunityTypes: OPPORTUNITY_TYPES.map((id) => ({ id, label: OPPORTUNITY_TYPE_LABELS[id] })),
      sourceKinds: SOURCE_KINDS.map((id) => ({ id, label: SOURCE_KIND_LABELS[id] })),
      trackerStages: TRACKER_STAGES.map((id) => ({ id, label: TRACKER_STAGE_LABELS[id] })),
      packs: loadPacks().map((p) => ({ id: p.id, name: p.name })),
    });
  });
  v1.use(createAuthRouter(ctx));
  v1.use(createPublicPushRouter(ctx));

  const authed = Router();
  authed.use(requireAuth(ctx));
  authed.use(createProfileRouter(ctx));
  authed.use(createSourcesRouter(ctx));
  authed.use(createFeedRouter(ctx));
  authed.use(createTrackerRouter(ctx));
  authed.use(createAlertsRouter(ctx));
  authed.use(createSettingsRouter(ctx));
  v1.use(authed);

  app.use('/v1', v1);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
