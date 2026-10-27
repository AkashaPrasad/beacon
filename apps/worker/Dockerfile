# syntax=docker/dockerfile:1.7
# Beacon worker production image (linux/arm64 + linux/amd64).
# Build context is the REPO ROOT:
#   docker build -f apps/worker/Dockerfile -t beacon-worker .
# NOTE: onnxruntime-node (used by @huggingface/transformers for local embeddings) ships
# glibc binaries; the runtime stage adds gcompat + libstdc++ for musl. If embeddings fail
# to load on Alpine, build with --build-arg NODE_IMAGE=node:22-bookworm-slim (docs/DECISIONS.md).
ARG NODE_IMAGE=node:22-alpine
ARG PNPM_VERSION=12.8.1

# ── base: node + pinned pnpm ──────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS base
ARG PNPM_VERSION
ENV CI=true HUSKY=0 PNPM_STORE_DIR=/pnpm/store
RUN npm install -g "pnpm@${PNPM_VERSION}" && pnpm --version
WORKDIR /repo

# ── build: install (cached by manifests), compile, prune with `pnpm deploy` ───
FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store --filter "@kestrel/worker..."
COPY packages/config ./packages/config
COPY packages/shared ./packages/shared
COPY apps/worker ./apps/worker
# Topological: builds @kestrel/shared (tsup) before @kestrel/worker (tsc).
RUN pnpm --filter "@kestrel/worker..." run build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @kestrel/worker deploy --prod --store-dir /pnpm/store /out

# ── runtime: production deps + dist only, non-root ────────────────────────────
FROM ${NODE_IMAGE} AS runtime
# glibc shims for native addons (onnxruntime-node) on musl; no-op on Debian images.
RUN if command -v apk >/dev/null 2>&1; then apk add --no-cache gcompat libstdc++; fi
ENV NODE_ENV=production \
    NODE_OPTIONS=--max-old-space-size=768 \
    HEALTH_PORT=4001
WORKDIR /app
COPY --from=build --chown=node:node /out/package.json ./package.json
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/dist ./dist
# Writable cache for downloaded embedding models.
RUN mkdir -p /app/.cache && chown node:node /app/.cache
ENV HF_HOME=/app/.cache/huggingface
USER node
EXPOSE 4001
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${HEALTH_PORT}/healthz" || exit 1
CMD ["node", "dist/index.js"]
