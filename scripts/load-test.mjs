#!/usr/bin/env node
// Load and soak tests for the Beacon API with autocannon (SPEC §8 "Load").
//
//   node scripts/load-test.mjs                     # /healthz + /v1/feed, 50 connections, 30 s each
//   node scripts/load-test.mjs --soak              # + 10-minute soak on /v1/feed, memory sampled every 10 s
//   node scripts/load-test.mjs --light             # prod-safe: /healthz only, 10 connections, 15 s
//   node scripts/load-test.mjs --record            # also write the result tables into docs/TESTING.md
//
// Env: API_URL (default http://localhost:4000), LOAD_TOKEN (JWT for Authorization: Bearer;
// without it /v1/feed is reported as not run), LOAD_LABEL (free text for the results table).
// Options: --connections N, --duration S, --soak-minutes M, --json out.json.
// Exit 1 when a target that ran misses its threshold (feed p95 < 300 ms, < 1 % errors) or the
// soak shows a heap leak.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import autocannon from 'autocannon';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { values: args } = parseArgs({
  options: {
    soak: { type: 'boolean', default: false },
    light: { type: 'boolean', default: false },
    record: { type: 'boolean', default: false },
    connections: { type: 'string' },
    duration: { type: 'string' },
    'soak-minutes': { type: 'string', default: '10' },
    json: { type: 'string' },
  },
});

const API_URL = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');
const TOKEN = process.env.LOAD_TOKEN ?? '';
const LABEL = process.env.LOAD_LABEL ?? (API_URL.includes('localhost') ? 'local dev' : API_URL);
const connections = Number(args.connections ?? (args.light ? 10 : 50));
const duration = Number(args.duration ?? (args.light ? 15 : 30));
const soakMinutes = Number(args['soak-minutes']);

/** p-th percentile of a sorted array (nearest rank). */
function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[rank];
}

const fmtMs = (v) => (v === null || v === undefined ? '–' : `${Math.round(v * 10) / 10}`);
const fmtMb = (b) => (b === null || b === undefined ? '–' : `${(b / 1024 / 1024).toFixed(1)}`);

async function preflight(path, headers) {
  try {
    const res = await fetch(`${API_URL}${path}`, { headers, signal: AbortSignal.timeout(10_000) });
    return { status: res.status, body: await res.text() };
  } catch (err) {
    return { status: 0, body: String(err?.cause?.code ?? err?.message ?? err) };
  }
}

/** Run autocannon and compute p50/p95/p99 from every response (autocannon has no p95 bucket). */
function run({ name, path, headers = {}, conns = connections, seconds = duration, onTick }) {
  return new Promise((resolve, reject) => {
    const latencies = [];
    const statuses = {};
    const instance = autocannon(
      { url: `${API_URL}${path}`, connections: conns, duration: seconds, headers, timeout: 10 },
      (err, result) => {
        if (err) return reject(err);
        latencies.sort((a, b) => a - b);
        const total = latencies.length;
        const ok = Object.entries(statuses)
          .filter(([s]) => s.startsWith('2'))
          .reduce((n, [, c]) => n + c, 0);
        resolve({
          name,
          path,
          connections: conns,
          seconds,
          requests: total,
          rps: result.requests.average,
          p50: percentile(latencies, 50),
          p95: percentile(latencies, 95),
          p99: percentile(latencies, 99),
          max: latencies.at(-1) ?? null,
          errors: result.errors + result.timeouts,
          non2xx: total - ok,
          statuses,
        });
      },
    );
    instance.on('response', (_client, statusCode, _bytes, responseTime) => {
      latencies.push(responseTime);
      statuses[statusCode] = (statuses[statusCode] ?? 0) + 1;
    });
    if (onTick) {
      const timer = setInterval(onTick, 10_000);
      instance.on('done', () => clearInterval(timer));
    }
  });
}

/** Memory sample from /healthz?mem=1 ({ mem: { rss, heapUsed, … } }) or Prometheus /metrics. */
async function sampleMemory(headers) {
  const h = await preflight('/healthz?mem=1', headers);
  if (h.status === 200) {
    try {
      const mem = JSON.parse(h.body).mem;
      if (mem && typeof mem.heapUsed === 'number')
        return { source: '/healthz?mem=1', rss: mem.rss, heapUsed: mem.heapUsed };
    } catch {
      /* not JSON */
    }
  }
  const m = await preflight('/metrics', headers);
  if (m.status === 200) {
    const num = (re) => {
      const hit = re.exec(m.body);
      return hit ? Number(hit[1]) : null;
    };
    const rss = num(/^process_resident_memory_bytes\s+([0-9.e+]+)/m);
    const heapUsed = num(/^nodejs_heap_size_used_bytes\s+([0-9.e+]+)/m);
    if (rss !== null || heapUsed !== null) return { source: '/metrics', rss, heapUsed };
  }
  return null;
}

/** Least-squares slope in MB/minute. */
function slopeMbPerMin(samples, key) {
  const pts = samples.filter((s) => typeof s[key] === 'number');
  if (pts.length < 3) return null;
  const xs = pts.map((s) => s.t / 60_000);
  const ys = pts.map((s) => s[key] / 1024 / 1024);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const num = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0);
  const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  return den === 0 ? 0 : num / den;
}

const results = [];
const notes = [];
let failed = false;

const health = await preflight('/healthz');
if (health.status !== 200) {
  console.error(
    `API not reachable: GET ${API_URL}/healthz → ${health.status} ${health.body.slice(0, 120)}`,
  );
  process.exit(2);
}

console.log(`Beacon load test → ${API_URL} (${connections} connections, ${duration} s per target)`);
results.push(await run({ name: 'healthz', path: '/healthz' }));

const auth = TOKEN ? { authorization: `Bearer ${TOKEN}` } : null;
if (args.light) {
  notes.push('Light mode: /healthz only (safe against production).');
} else if (!auth) {
  notes.push('/v1/feed not run: LOAD_TOKEN is not set (see docs/TESTING.md "Load").');
} else {
  const probe = await preflight('/v1/feed?limit=20', auth);
  if (probe.status !== 200) {
    notes.push(
      `/v1/feed not run: preflight returned HTTP ${probe.status} (${probe.body.slice(0, 80)}).`,
    );
    failed = true;
  } else {
    results.push(await run({ name: 'feed', path: '/v1/feed?limit=20', headers: auth }));
    results.push(
      await run({
        name: 'feed (page 2 filters)',
        path: '/v1/feed?limit=50&types=internship&sort=deadline',
        headers: auth,
      }),
    );
  }
}

let soak = null;
if (args.soak && !args.light) {
  const path = auth ? '/v1/feed?limit=20' : '/healthz';
  const headers = auth ?? {};
  const first = await sampleMemory(headers);
  if (!first)
    notes.push(
      'Soak memory not sampled: no /healthz?mem=1 or /metrics endpoint (docs/SHARED-REQUESTS.md qa → api #2).',
    );
  const samples = [];
  const t0 = Date.now();
  if (first) samples.push({ t: 0, ...first });
  console.log(
    `Soak: ${soakMinutes} min on ${path}, 20 connections${first ? `, memory from ${first.source}` : ''}`,
  );
  const r = await run({
    name: `soak ${soakMinutes} min`,
    path,
    headers,
    conns: 20,
    seconds: soakMinutes * 60,
    onTick: first
      ? () => {
          void sampleMemory(headers).then((m) => {
            if (m) samples.push({ t: Date.now() - t0, ...m });
          });
        }
      : undefined,
  });
  results.push(r);
  if (first) {
    const last = await sampleMemory(headers);
    if (last) samples.push({ t: Date.now() - t0, ...last });
    // Ignore the first minute (JIT warm-up, caches filling).
    const steady = samples.filter((s) => s.t >= 60_000);
    const heapSlope = slopeMbPerMin(steady, 'heapUsed');
    const rssSlope = slopeMbPerMin(steady, 'rss');
    const maxHeap = Math.max(...samples.map((s) => s.heapUsed ?? 0));
    soak = {
      samples: samples.length,
      startHeap: samples[0]?.heapUsed ?? null,
      endHeap: samples.at(-1)?.heapUsed ?? null,
      maxHeap,
      startRss: samples[0]?.rss ?? null,
      endRss: samples.at(-1)?.rss ?? null,
      heapSlope,
      rssSlope,
      // A leak grows steadily: > 1 MB/min of heap after warm-up over a 10-minute run.
      stable: heapSlope === null ? null : heapSlope < 1,
    };
    if (soak.stable === false) failed = true;
  }
}

// ── Thresholds ──────────────────────────────────────────────────────────────
for (const r of results) {
  const errRate = r.requests ? (r.non2xx + r.errors) / r.requests : 1;
  r.errorRate = errRate;
  r.pass = errRate < 0.01 && (!r.name.startsWith('feed') || (r.p95 ?? Infinity) < 300);
  if (!r.pass) failed = true;
}

// ── Output ──────────────────────────────────────────────────────────────────
const date = new Date().toISOString().slice(0, 16).replace('T', ' ');
const latencyRows = results.map(
  (r) =>
    `| ${date} UTC | ${LABEL} | \`${r.path}\` | ${r.connections} | ${r.seconds} s | ${r.requests.toLocaleString('en-IN')} | ${Math.round(r.rps).toLocaleString('en-IN')} | ${fmtMs(r.p50)} | ${fmtMs(r.p95)} | ${fmtMs(r.p99)} | ${(r.errorRate * 100).toFixed(2)} % | ${r.pass ? 'pass' : '**fail**'} |`,
);
const soakRow = soak
  ? `| ${date} UTC | ${LABEL} | ${soakMinutes} min | ${soak.samples} | ${fmtMb(soak.startHeap)} → ${fmtMb(soak.endHeap)} (max ${fmtMb(soak.maxHeap)}) | ${fmtMb(soak.startRss)} → ${fmtMb(soak.endRss)} | ${soak.heapSlope === null ? '–' : soak.heapSlope.toFixed(2)} | ${soak.stable === null ? '–' : soak.stable ? 'stable' : '**leak?**'} |`
  : null;

console.log(
  '\n| Date | Target | Path | Conns | Duration | Requests | Req/s | p50 ms | p95 ms | p99 ms | Errors | Result |',
);
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const row of latencyRows) console.log(row);
if (soakRow) {
  console.log(
    '\n| Date | Target | Soak | Samples | Heap used MB | RSS MB | Heap slope MB/min | Verdict |',
  );
  console.log('|---|---|---|---|---|---|---|---|');
  console.log(soakRow);
}
for (const n of notes) console.log(`note: ${n}`);

if (args.json)
  writeFileSync(
    args.json,
    JSON.stringify({ date, api: API_URL, label: LABEL, results, soak, notes }, null, 2),
  );

if (args.record) {
  const file = join(root, 'docs', 'TESTING.md');
  let md = readFileSync(file, 'utf8');
  const insert = (marker, rows) => {
    const re = new RegExp(
      `(<!-- ${marker}:begin -->\\n(?:.*\\n)*?\\|---.*\\n)((?:\\|.*\\n)*?)(<!-- ${marker}:end -->)`,
    );
    if (!re.test(md)) {
      console.warn(`docs/TESTING.md has no ${marker} markers; not recorded`);
      return;
    }
    md = md.replace(re, (_m, head, body, end) => {
      const kept = body
        .split('\n')
        .filter(Boolean)
        .slice(-(20 - rows.length));
      return `${head}${[...kept, ...rows].join('\n')}\n${end}`;
    });
  };
  insert('load', latencyRows);
  if (soakRow) insert('soak', [soakRow]);
  writeFileSync(file, md);
  console.log('recorded in docs/TESTING.md');
}

process.exit(failed ? 1 : 0);
