/**
 * OpenAPI 3.1 document generated from the same zod schemas the routes validate with
 * (zod-openapi on zod 4). Served at /openapi.json; Scalar renders it at /docs.
 */
import {
  alertRuleInputSchema,
  alertRulePatchSchema,
  alertRuleSchema,
  detectSourceRequestSchema,
  detectSourceResponseSchema,
  notificationSchema,
  profileInputSchema,
  profilePatchSchema,
  publicUserSchema,
  resumeParseResultSchema,
  settingsPatchSchema,
  settingsSchema,
  sourceSchema,
  sourceUpdateSchema,
  trackerItemSchema,
  trackerMoveSchema,
  weightsInputSchema,
} from '@kestrel/shared';
import { z } from 'zod';
import { createDocument, type ZodOpenApiOperationObject, type ZodOpenApiPathsObject } from 'zod-openapi';

import {
  aiSettingsPutSchema,
  aiTestSchema,
  communitySourcesQuerySchema,
  feedQueryApiSchema,
  googleAuthSchema,
  mePatchSchema,
  notificationsQuerySchema,
  notificationsReadSchema,
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
  sourceCreateBodySchema,
  trackerCreateBodySchema,
  trackerListQuerySchema,
  trackerPatchSchema,
} from './schemas/index.js';

const errorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      issues: z.array(z.object({ path: z.array(z.union([z.string(), z.number()])), code: z.string(), message: z.string() })).optional(),
      details: z.unknown().optional(),
    }),
  })
  .meta({ id: 'Error' });

const json = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });
const anyJson = z.record(z.string(), z.unknown());

interface RouteSpec {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
  tag: string;
  summary: string;
  auth?: boolean;
  body?: z.ZodType;
  query?: z.ZodObject;
  response?: z.ZodType;
  status?: number;
}

const idPath = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) });

const ROUTES: RouteSpec[] = [
  { method: 'get', path: '/healthz', tag: 'Platform', summary: 'Liveness', auth: false, response: z.object({ ok: z.boolean() }) },
  { method: 'get', path: '/readyz', tag: 'Platform', summary: 'Readiness (Mongo + Redis ping)', auth: false, response: z.object({ ok: z.boolean(), mongo: z.string(), redis: z.string() }) },
  { method: 'get', path: '/v1/meta', tag: 'Platform', summary: 'Enumerations for the UI', auth: false },

  { method: 'get', path: '/v1/auth/google/url', tag: 'Auth', summary: 'Google authorization URL (redirect flow)', auth: false, query: z.object({ state: z.string().optional(), redirectUri: z.string().optional() }), response: z.object({ url: z.string(), redirectUri: z.string() }) },
  { method: 'post', path: '/v1/auth/google', tag: 'Auth', summary: 'Sign in with a Google ID token or auth code', auth: false, body: googleAuthSchema, response: z.object({ user: publicUserSchema, isNew: z.boolean() }) },
  { method: 'post', path: '/v1/auth/logout', tag: 'Auth', summary: 'Clear the session cookie', auth: false, status: 204 },
  { method: 'get', path: '/v1/me', tag: 'Auth', summary: 'Current user, onboarding state, settings summary' },
  { method: 'patch', path: '/v1/me', tag: 'Auth', summary: 'Update name, onboarding step or consent', body: mePatchSchema },

  { method: 'get', path: '/v1/profile', tag: 'Profile', summary: 'Get the profile' },
  { method: 'put', path: '/v1/profile', tag: 'Profile', summary: 'Replace the profile', body: profileInputSchema },
  { method: 'patch', path: '/v1/profile', tag: 'Profile', summary: 'Patch the profile', body: profilePatchSchema },
  { method: 'post', path: '/v1/profile/resume', tag: 'Profile', summary: 'Upload and parse a resume (multipart field "file")', query: z.object({ save: z.enum(['true', 'false']).optional() }), response: resumeParseResultSchema.omit({ method: true }).extend({ parsedFrom: z.enum(['deterministic', 'llm']), saved: z.boolean() }) },

  { method: 'get', path: '/v1/sources', tag: 'Sources', summary: 'List personal sources', response: z.object({ items: z.array(sourceSchema) }) },
  { method: 'post', path: '/v1/sources', tag: 'Sources', summary: 'Add a personal source', body: sourceCreateBodySchema, status: 201 },
  { method: 'get', path: '/v1/sources/community', tag: 'Sources', summary: 'Community sources (read-only)', query: communitySourcesQuerySchema },
  { method: 'get', path: '/v1/sources/packs', tag: 'Sources', summary: 'Source packs with enabled state' },
  { method: 'post', path: '/v1/sources/packs/{packId}/enable', tag: 'Sources', summary: 'Subscribe to a pack' },
  { method: 'post', path: '/v1/sources/packs/{packId}/disable', tag: 'Sources', summary: 'Unsubscribe from a pack' },
  { method: 'post', path: '/v1/sources/detect', tag: 'Sources', summary: 'Detect source kind and preview count', body: detectSourceRequestSchema, response: detectSourceResponseSchema },
  { method: 'get', path: '/v1/sources/credits', tag: 'Sources', summary: 'Crawl credit meter' },
  { method: 'get', path: '/v1/sources/{id}', tag: 'Sources', summary: 'Get a source' },
  { method: 'patch', path: '/v1/sources/{id}', tag: 'Sources', summary: 'Update a personal source', body: sourceUpdateSchema },
  { method: 'delete', path: '/v1/sources/{id}', tag: 'Sources', summary: 'Delete a personal source', status: 204 },

  { method: 'get', path: '/v1/feed', tag: 'Feed', summary: 'Ranked feed (cursor pagination)', query: feedQueryApiSchema },
  { method: 'get', path: '/v1/feed/summary', tag: 'Feed', summary: 'Counts by type, deadlines this week, new since last visit' },
  { method: 'post', path: '/v1/feed/seen', tag: 'Feed', summary: 'Mark the feed as seen now', status: 204 },
  { method: 'get', path: '/v1/listings/{id}', tag: 'Feed', summary: 'Listing detail' },
  { method: 'post', path: '/v1/listings/{id}/save', tag: 'Feed', summary: 'Save' },
  { method: 'post', path: '/v1/listings/{id}/unsave', tag: 'Feed', summary: 'Unsave' },
  { method: 'post', path: '/v1/listings/{id}/hide', tag: 'Feed', summary: 'Hide' },
  { method: 'post', path: '/v1/listings/{id}/unhide', tag: 'Feed', summary: 'Unhide' },
  { method: 'post', path: '/v1/listings/{id}/explain', tag: 'Feed', summary: 'Why it fits / gaps / tailoring tips' },

  { method: 'get', path: '/v1/tracker', tag: 'Tracker', summary: 'List tracker items', query: trackerListQuerySchema, response: z.object({ items: z.array(trackerItemSchema) }) },
  { method: 'post', path: '/v1/tracker', tag: 'Tracker', summary: 'Track a listing or a manual application', body: trackerCreateBodySchema, status: 201 },
  { method: 'get', path: '/v1/tracker/analytics', tag: 'Tracker', summary: 'Outcome analytics' },
  { method: 'get', path: '/v1/tracker/{id}', tag: 'Tracker', summary: 'Get an item' },
  { method: 'patch', path: '/v1/tracker/{id}', tag: 'Tracker', summary: 'Update an item', body: trackerPatchSchema },
  { method: 'post', path: '/v1/tracker/{id}/move', tag: 'Tracker', summary: 'Move to a stage/position', body: trackerMoveSchema },
  { method: 'delete', path: '/v1/tracker/{id}', tag: 'Tracker', summary: 'Delete an item', status: 204 },

  { method: 'get', path: '/v1/alerts', tag: 'Alerts', summary: 'List alert rules', response: z.object({ items: z.array(alertRuleSchema) }) },
  { method: 'post', path: '/v1/alerts', tag: 'Alerts', summary: 'Create an alert rule', body: alertRuleInputSchema, status: 201 },
  { method: 'get', path: '/v1/alerts/{id}', tag: 'Alerts', summary: 'Get an alert rule' },
  { method: 'patch', path: '/v1/alerts/{id}', tag: 'Alerts', summary: 'Update an alert rule', body: alertRulePatchSchema },
  { method: 'delete', path: '/v1/alerts/{id}', tag: 'Alerts', summary: 'Delete an alert rule', status: 204 },
  { method: 'post', path: '/v1/alerts/{id}/test', tag: 'Alerts', summary: 'Send a test notification', status: 202 },
  { method: 'get', path: '/v1/push/vapid-public-key', tag: 'Alerts', summary: 'VAPID public key', auth: false, response: z.object({ publicKey: z.string() }) },
  { method: 'get', path: '/v1/push/subscriptions', tag: 'Alerts', summary: 'List push subscriptions' },
  { method: 'post', path: '/v1/push/subscriptions', tag: 'Alerts', summary: 'Register a push subscription', body: pushSubscriptionSchema, status: 201 },
  { method: 'delete', path: '/v1/push/subscriptions', tag: 'Alerts', summary: 'Remove a push subscription by endpoint', body: pushUnsubscribeSchema, status: 204 },
  { method: 'delete', path: '/v1/push/subscriptions/{id}', tag: 'Alerts', summary: 'Remove a push subscription', status: 204 },
  { method: 'get', path: '/v1/notifications', tag: 'Notifications', summary: 'In-app notifications', query: notificationsQuerySchema, response: z.object({ items: z.array(notificationSchema), nextCursor: z.string().nullable(), unreadCount: z.number() }) },
  { method: 'post', path: '/v1/notifications/read', tag: 'Notifications', summary: 'Mark notifications read', body: notificationsReadSchema },

  { method: 'get', path: '/v1/settings', tag: 'Settings', summary: 'Get settings', response: settingsSchema },
  { method: 'patch', path: '/v1/settings', tag: 'Settings', summary: 'Patch settings', body: settingsPatchSchema, response: settingsSchema },
  { method: 'put', path: '/v1/settings/ai', tag: 'Settings', summary: 'Set AI provider / BYOK key', body: aiSettingsPutSchema },
  { method: 'post', path: '/v1/settings/ai/test', tag: 'Settings', summary: 'Test the AI provider (1-token completion)', body: aiTestSchema },
  { method: 'delete', path: '/v1/settings/ai/key', tag: 'Settings', summary: 'Delete the saved API key' },
  { method: 'put', path: '/v1/settings/weights', tag: 'Settings', summary: 'Set scoring weights', body: weightsInputSchema },
  { method: 'get', path: '/v1/settings/export', tag: 'Settings', summary: 'Download all your data (JSON)' },
  { method: 'delete', path: '/v1/account', tag: 'Settings', summary: 'Delete the account and all data', status: 204 },
];

function operation(route: RouteSpec): ZodOpenApiOperationObject {
  const params = /\{(\w+)\}/g.exec(route.path);
  const path = params?.[1] === 'id' ? idPath : params?.[1] ? z.object({ [params[1]]: z.string() }) : undefined;
  const status = route.status ?? 200;
  const responses: ZodOpenApiOperationObject['responses'] = {
    [status]: status === 204
      ? { description: 'No content' }
      : { description: 'OK', ...json(route.response ?? anyJson) },
    400: { description: 'Validation error', ...json(errorSchema) },
    ...(route.auth === false ? {} : { 401: { description: 'Not signed in', ...json(errorSchema) } }),
    429: { description: 'Rate limited', ...json(errorSchema) },
  };
  return {
    tags: [route.tag],
    summary: route.summary,
    ...(route.auth === false ? { security: [] } : {}),
    ...(route.body ? { requestBody: json(route.body) } : {}),
    ...(route.query || path ? { requestParams: { ...(route.query ? { query: route.query } : {}), ...(path ? { path } : {}) } } : {}),
    responses,
  };
}

let cached: ReturnType<typeof createDocument> | null = null;

export function openApiDocument(serverUrl?: string): ReturnType<typeof createDocument> {
  if (cached) return cached;
  const paths: ZodOpenApiPathsObject = {};
  for (const route of ROUTES) {
    paths[route.path] = { ...(paths[route.path] ?? {}), [route.method]: operation(route) };
  }
  cached = createDocument({
    openapi: '3.1.0',
    info: {
      title: 'Beacon API',
      version: '1.0.0',
      description:
        'Beacon aggregates internships, jobs, hackathons, scholarships and research programs and ranks them with an explainable fit score. Mutating requests need `X-Requested-With: beacon` when using the session cookie.',
    },
    ...(serverUrl ? { servers: [{ url: serverUrl }] } : {}),
    components: {
      securitySchemes: {
        cookie: { type: 'apiKey', in: 'cookie', name: 'beacon_session' },
        bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    security: [{ cookie: [] }, { bearer: [] }],
    paths,
  });
  return cached;
}

export const DOCS_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Beacon API reference</title>
  </head>
  <body>
    <script id="api-reference" data-url="/openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.25.130"></script>
  </body>
</html>`;
