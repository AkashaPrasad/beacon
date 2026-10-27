/**
 * API contract suite (QA). Runs against a **running** API (`CONTRACT_API_URL` or `API_URL`,
 * default http://localhost:4000) and checks three things:
 *
 * 1. `/openapi.json` is a valid OpenAPI 3.1 document whose schemas all compile (ajv 2020-12).
 * 2. Coverage both ways: every route in docs/API.md is in the OpenAPI document and vice versa,
 *    and every documented operation is exercised by at least one test in `apps/api/src`
 *    (grep for `.<method>('<path>'` with path params as literals or `${…}`).
 * 3. Live responses match their documented schemas: every parameterless GET (public, or with
 *    `CONTRACT_TOKEN`/`LOAD_TOKEN` as a bearer token), every user route without a session
 *    (401 error envelope with `details.reason`), and malformed ids (404 envelope).
 *
 * Run: `pnpm test:contract` (root) after starting the API. Not part of `pnpm test`, because it
 * needs a live server; it fails, never skips, when the server is down.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import { beforeAll, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(here, '..', '..');
const repoRoot = join(apiRoot, '..', '..');
const BASE = (
  process.env.CONTRACT_API_URL ??
  process.env.API_URL ??
  'http://localhost:4000'
).replace(/\/+$/, '');
const TOKEN = process.env.CONTRACT_TOKEN ?? process.env.LOAD_TOKEN ?? '';
const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
type Method = (typeof METHODS)[number];

interface Operation {
  security?: unknown[];
  responses?: Record<string, { content?: Record<string, { schema?: unknown }> }>;
}
interface OpenApiDoc {
  openapi: string;
  info?: { title?: string; version?: string };
  paths: Record<string, Partial<Record<Method, Operation>>>;
  components?: { schemas?: Record<string, unknown> };
}

let doc: OpenApiDoc;
const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: true });
// ajv-formats is CommonJS; under NodeNext its default export arrives as the module object.
const addFormats = ((addFormatsModule as unknown as { default?: unknown }).default ??
  addFormatsModule) as (a: Ajv2020) => void;
addFormats(ajv);
const DOC_ID = 'beacon-openapi';

/** Rewrite local `#/components/...` refs so they resolve against the registered document. */
function retarget(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(retarget);
  if (schema && typeof schema === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema)) {
      out[k] =
        k === '$ref' && typeof v === 'string' && v.startsWith('#/') ? `${DOC_ID}${v}` : retarget(v);
    }
    return out;
  }
  return schema;
}

const operations = (): { method: Method; path: string; op: Operation }[] =>
  Object.entries(doc.paths).flatMap(([path, item]) =>
    METHODS.filter((m) => item[m]).map((method) => ({ method, path, op: item[method]! })),
  );

const isPublic = (op: Operation) => Array.isArray(op.security) && op.security.length === 0;
const jsonSchemaOf = (op: Operation, status: string) =>
  op.responses?.[status]?.content?.['application/json']?.schema;

const validators = new Map<string, ValidateFunction>();
function validatorFor(method: Method, path: string, status: string): ValidateFunction | null {
  const key = `${method} ${path} ${status}`;
  if (validators.has(key)) return validators.get(key)!;
  const schema = jsonSchemaOf(doc.paths[path]![method]!, status);
  if (!schema) return null;
  const fn = ajv.compile(retarget(schema) as object);
  validators.set(key, fn);
  return fn;
}

async function call(method: string, path: string, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: method.toUpperCase(),
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    /* not JSON */
  }
  return { status: res.status, body, type: res.headers.get('content-type') ?? '' };
}

const fmtErrors = (fn: ValidateFunction) =>
  (fn.errors ?? [])
    .slice(0, 5)
    .map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`)
    .join('; ');

beforeAll(async () => {
  let res: Response;
  try {
    res = await fetch(`${BASE}/openapi.json`, { signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    throw new Error(
      `API not reachable at ${BASE} (${String((err as Error).cause ?? err)}). Start it first: see docs/TESTING.md "API contract".`,
      { cause: err },
    );
  }
  expect(res.status, `GET ${BASE}/openapi.json`).toBe(200);
  doc = (await res.json()) as OpenApiDoc;
  ajv.addSchema({ $id: DOC_ID, components: doc.components ?? {} });
});

describe('OpenAPI document', () => {
  it('is OpenAPI 3.1 with paths and operations', () => {
    expect(doc.openapi).toMatch(/^3\.1\./);
    expect(Object.keys(doc.paths).length).toBeGreaterThan(10);
    for (const { method, path, op } of operations()) {
      expect(op.responses, `${method.toUpperCase()} ${path} has no responses`).toBeTruthy();
    }
  });

  it('every response schema compiles (JSON Schema 2020-12)', () => {
    const broken: string[] = [];
    for (const { method, path, op } of operations()) {
      for (const status of Object.keys(op.responses ?? {})) {
        try {
          validatorFor(method, path, status);
        } catch (err) {
          broken.push(`${method.toUpperCase()} ${path} ${status}: ${(err as Error).message}`);
        }
      }
    }
    expect(broken, broken.join('\n')).toEqual([]);
  });

  it('reports operations whose success response is an untyped object (documentation gap)', () => {
    const loose = operations()
      .filter(({ op }) => {
        const ok = Object.keys(op.responses ?? {}).find((s) => s.startsWith('2'));
        const schema = ok
          ? (jsonSchemaOf(op, ok) as Record<string, unknown> | undefined)
          : undefined;
        return (
          schema !== undefined &&
          schema['type'] === 'object' &&
          !schema['properties'] &&
          !schema['$ref']
        );
      })
      .map(({ method, path }) => `${method.toUpperCase()} ${path}`);
    // Informational: printed so docs/TESTING.md and SHARED-REQUESTS can track it.
    console.info(
      `[contract] ${loose.length} operations document their 2xx body as a generic object:\n  ${loose.join('\n  ')}`,
    );
    expect(Array.isArray(loose)).toBe(true);
  });
});

// ── Coverage ────────────────────────────────────────────────────────────────

/** Routes from the tables in docs/API.md: `| GET | \`/v1/feed\` | …`. */
function documentedRoutes(): Set<string> {
  const md = readFileSync(join(repoRoot, 'docs', 'API.md'), 'utf8');
  const out = new Set<string>();
  for (const m of md.matchAll(/^\|\s*(GET|POST|PUT|PATCH|DELETE)\s*\|\s*`([^`]+)`/gm)) {
    out.add(`${m[1]!.toLowerCase()} ${m[2]!.replace(/:([A-Za-z]+)/g, '{$1}')}`);
  }
  return out;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === 'node_modules' || name === 'contract') continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.test\.ts$/.test(name)) out.push(full);
  }
  return out;
}

function testFiles(): { file: string; text: string }[] {
  const dirs = [join(apiRoot, 'src'), join(apiRoot, 'test')].filter((d) => {
    try {
      return statSync(d).isDirectory();
    } catch {
      return false;
    }
  });
  return dirs
    .flatMap((d) => walk(d))
    .map((file) => ({ file: relative(apiRoot, file), text: readFileSync(file, 'utf8') }));
}

/** `.post('/v1/sources/${id}/save'` or `.post(\`/v1/sources/abc/save?x=1\`` for `/v1/sources/{id}/save`. */
function routeRegex(method: Method, path: string): RegExp {
  const parts = path
    .split(/(\{[^}]+\})/)
    .map((p) =>
      p.startsWith('{')
        ? String.raw`(?:\$\{[^}]+\}|[^/'"\x60?\s]+)`
        : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    );
  return new RegExp(String.raw`\.${method}\(\s*['"\x60]${parts.join('')}(?:\?[^'"\x60]*)?['"\x60]`);
}

describe('coverage', () => {
  it('docs/API.md and /openapi.json list the same routes', () => {
    const documented = documentedRoutes();
    const inSpec = new Set(operations().map(({ method, path }) => `${method} ${path}`));
    const notInSpec = [...documented].filter(
      (r) => !inSpec.has(r) && !['get /openapi.json', 'get /docs'].includes(r),
    );
    const notInDocs = [...inSpec].filter((r) => !documented.has(r));
    expect(
      { notInSpec, notInDocs },
      `API.md routes missing from OpenAPI: ${notInSpec.join(', ') || 'none'}; OpenAPI routes missing from API.md: ${notInDocs.join(', ') || 'none'}`,
    ).toEqual({ notInSpec: [], notInDocs: [] });
  });

  it('every documented operation has at least one API test', () => {
    const files = testFiles();
    const untested = operations()
      .filter(({ method, path }) => !files.some((f) => routeRegex(method, path).test(f.text)))
      .map(({ method, path }) => `${method.toUpperCase()} ${path}`);
    const total = operations().length;
    console.info(
      `[contract] route test coverage: ${total - untested.length}/${total} operations; untested:\n  ${untested.join('\n  ') || 'none'}`,
    );
    expect(untested, `${untested.length} operation(s) without an API test`).toEqual([]);
  });
});

// ── Live responses ──────────────────────────────────────────────────────────

describe('live responses match the documented schemas', () => {
  it('parameterless GETs (public; plus user routes when a token is given)', async () => {
    const failures: string[] = [];
    let checked = 0;
    for (const { method, path, op } of operations()) {
      if (method !== 'get' || path.includes('{') || path === '/v1/settings/export') continue;
      if (!isPublic(op) && !TOKEN) continue;
      const res = await call('get', path, isPublic(op) ? {} : { authorization: `Bearer ${TOKEN}` });
      const status = String(res.status);
      if (!op.responses?.[status]) {
        failures.push(`GET ${path} → ${status}, which is not a documented response`);
        continue;
      }
      const fn = validatorFor('get', path, status);
      checked += 1;
      if (fn && !fn(res.body)) failures.push(`GET ${path} ${status}: ${fmtErrors(fn)}`);
    }
    console.info(
      `[contract] validated ${checked} live GET responses${TOKEN ? '' : ' (public only: set CONTRACT_TOKEN for user routes)'}`,
    );
    expect(failures, failures.join('\n')).toEqual([]);
    expect(checked).toBeGreaterThan(0);
  });

  it('user routes without a session: 401 envelope with details.reason = missing', async () => {
    const failures: string[] = [];
    for (const { method, path, op } of operations()) {
      if (isPublic(op) || method !== 'get') continue;
      const concrete = path.replace(/\{[^}]+\}/g, '0123456789abcdef01234567');
      const res = await call(method, concrete);
      const body = res.body as { error?: { code?: string; details?: { reason?: string } } } | null;
      if (
        res.status !== 401 ||
        body?.error?.code !== 'UNAUTHENTICATED' ||
        body.error.details?.reason !== 'missing'
      ) {
        failures.push(`GET ${concrete} → ${res.status} ${JSON.stringify(body).slice(0, 120)}`);
        continue;
      }
      const fn = validatorFor(method, path, '401');
      if (fn && !fn(res.body)) failures.push(`GET ${path} 401 envelope: ${fmtErrors(fn)}`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('mutations without the CSRF header are refused with 403 CSRF', async () => {
    const res = await call('post', '/v1/feed/seen');
    expect([401, 403]).toContain(res.status);
    const logout = await call('post', '/v1/auth/logout');
    expect(logout.status).toBe(403);
    expect((logout.body as { error?: { code?: string } }).error?.code).toBe('CSRF');
  });

  it('malformed ids: 404 NOT_FOUND with a token, 401 before validation without one', async () => {
    const failures: string[] = [];
    for (const { method, path } of operations()) {
      if (method !== 'get' || !path.includes('{id}')) continue;
      const headers: Record<string, string> = TOKEN ? { authorization: `Bearer ${TOKEN}` } : {};
      const res = await call('get', path.replace('{id}', 'not-an-object-id'), headers);
      const code = (res.body as { error?: { code?: string } } | null)?.error?.code;
      const want = TOKEN ? [404, 'NOT_FOUND'] : [401, 'UNAUTHENTICATED'];
      if (res.status !== want[0] || code !== want[1])
        failures.push(`GET ${path} (bad id) → ${res.status} ${code ?? ''}, want ${want.join(' ')}`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('unknown routes return the error envelope', async () => {
    const res = await call('get', '/v1/definitely-not-a-route');
    expect(res.status).toBe(404);
    expect((res.body as { error?: { code?: string } }).error?.code).toBe('NOT_FOUND');
  });
});
