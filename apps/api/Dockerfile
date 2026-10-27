# syntax=docker/dockerfile:1.7
# Beacon API production image (linux/arm64 + linux/amd64).
# Build context is the REPO ROOT:
#   docker build -f apps/api/Dockerfile -t beacon-api .
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
    pnpm install --frozen-lockfile --store-dir /pnpm/store --filter "@kestrel/api..."
COPY packages/config ./packages/config
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
# Topological: builds @kestrel/shared (tsup) before @kestrel/api (tsc).
RUN pnpm --filter "@kestrel/api..." run build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @kestrel/api deploy --prod --store-dir /pnpm/store /out

# ── runtime: production deps + dist only, non-root ────────────────────────────
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NODE_OPTIONS=--max-old-space-size=512 \
    PORT=4000
WORKDIR /app
COPY --from=build --chown=node:node /out/package.json ./package.json
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/dist ./dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/healthz" || exit 1
CMD ["node", "dist/index.js"]
