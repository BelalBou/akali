# syntax=docker/dockerfile:1

# ──────────────────────────────────────────────────────────────
# Base: Node + pnpm (+ openssl for Prisma engines)
# ──────────────────────────────────────────────────────────────
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ──────────────────────────────────────────────────────────────
# Build: install all deps and compile every workspace package
# ──────────────────────────────────────────────────────────────
FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile
RUN pnpm -r build

# ──────────────────────────────────────────────────────────────
# Migrate: one-shot container that applies Prisma migrations
# ──────────────────────────────────────────────────────────────
FROM build AS migrate
WORKDIR /app/packages/db
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# ──────────────────────────────────────────────────────────────
# Bot runtime
# ──────────────────────────────────────────────────────────────
FROM base AS bot
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/bot
CMD ["node", "dist/index.js"]

# ──────────────────────────────────────────────────────────────
# Worker runtime (needs python3 + ffmpeg + yt-dlp)
# ──────────────────────────────────────────────────────────────
FROM base AS worker
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 ffmpeg wget \
  && wget -qO /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
WORKDIR /app/apps/worker
CMD ["node", "dist/index.js"]
