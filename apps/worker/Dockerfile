# syntax=docker/dockerfile:1
# Mesa import worker. Build context: the repository root (see infra/vps/docker-compose.yml):
#   docker build -f apps/worker/Dockerfile .

# --- build: install with pnpm, bundle with tsup, then a production-only node_modules -------------
FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    CI=true
# corepack reads "packageManager" (pnpm@10.x) from the root package.json
RUN npm install --global corepack@latest && corepack enable
WORKDIR /repo
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@mesa/worker..."
RUN pnpm --filter @mesa/worker build
# /out = apps/worker/package.json + dist/ + production dependencies only
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @mesa/worker deploy --prod --legacy /out

# --- runtime ---------------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates ffmpeg python3 tini \
 && rm -rf /var/lib/apt/lists/*

# yt-dlp: the official release binary (a Python zipapp). BuildKit re-checks this URL on every
# build, so `docker compose build worker` picks up a new release (see infra/vps/README.md).
ADD https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp /usr/local/bin/yt-dlp
RUN chmod 0755 /usr/local/bin/yt-dlp && /usr/local/bin/yt-dlp --version

ENV NODE_ENV=production \
    YTDLP_PATH=/usr/local/bin/yt-dlp \
    XDG_CACHE_HOME=/tmp/.cache
WORKDIR /app
COPY --from=build --chown=node:node /out/ ./

# the image's built-in unprivileged user (uid 1000)
USER node
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--enable-source-maps", "dist/index.js"]
