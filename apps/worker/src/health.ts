import { createServer, type Server } from 'node:http';

export interface HealthState {
  /** Returns the Redis connection status, e.g. "ready" | "connecting" | "end". */
  redisStatus: () => string;
  /** Mongo connection status ("connected" …); omitted from the body when not provided. */
  mongoStatus?: () => string;
  queues: readonly string[];
  /** Prometheus text for `GET /metrics`. */
  metrics?: () => Promise<string>;
}

/**
 * Tiny dependency-free HTTP server on 4001: `GET /healthz` (liveness, Docker healthcheck),
 * `GET /readyz` (503 until Redis is ready) and `GET /metrics` (Prometheus text).
 */
export function createHealthServer(state: HealthState): Server {
  return createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/healthz' || req.url === '/readyz')) {
      const redis = state.redisStatus();
      const mongo = state.mongoStatus?.();
      const ready = redis === 'ready' && (mongo === undefined || mongo === 'connected');
      const ok = req.url === '/healthz' || ready;
      res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok, redis, ...(mongo !== undefined ? { mongo } : {}), queues: state.queues }));
      return;
    }
    if (req.method === 'GET' && req.url === '/metrics' && state.metrics) {
      state
        .metrics()
        .then((body) => {
          res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' });
          res.end(body);
        })
        .catch((err: unknown) => {
          res.writeHead(500, { 'content-type': 'text/plain' });
          res.end(`# metrics error: ${err instanceof Error ? err.message : String(err)}\n`);
        });
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'not_found' } }));
  });
}
