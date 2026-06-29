# Akali

A Discord bot that watches creators on **YouTube, Instagram, Twitter/X and TikTok**
and posts their new videos **live** into Discord channels.

- `bot` — Discord gateway + slash commands (`/track add|remove|list`) to manage which
  channels follow which sources.
- `worker` — polls every tracked source on a schedule, detects new videos with
  [`yt-dlp`](https://github.com/yt-dlp/yt-dlp), and posts them to the subscribed channels.

## Tech stack

| Concern        | Choice                                  |
| -------------- | --------------------------------------- |
| Language       | TypeScript (ESM, Node 24)               |
| Monorepo       | pnpm workspaces                         |
| Database       | PostgreSQL + Prisma                     |
| Discord        | discord.js v14                          |
| Video sources  | yt-dlp (YouTube / Instagram / X / TikTok) |
| Scheduling     | node-cron                               |
| Orchestration  | Docker Compose + Makefile               |

## Layout

```
akali/
├── apps/
│   ├── bot/            # discord.js gateway + /track slash commands
│   └── worker/         # cron poller → yt-dlp → posts videos to Discord
├── packages/
│   ├── db/             # Prisma schema + generated client (@akali/db)
│   ├── config/         # zod-validated environment (@akali/config)
│   └── shared/         # logger, types, URL parsing (@akali/shared)
├── Dockerfile          # multi-stage: base / build / migrate / bot / worker
├── docker-compose.yml  # postgres + migrate + bot + worker
├── Makefile            # dev & ops shortcuts
└── .env.example
```

## Data model (Prisma)

- **Source** — a tracked channel/account (platform + external id + url).
- **Subscription** — links a Source to a Discord channel.
- **Video** — a discovered video (deduped by `platform + externalId`).
- **Delivery** — one video posted to one subscription (deduped, so a video is
  posted at most once per channel).

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) + Docker Compose
- [Node.js 22+](https://nodejs.org) and [pnpm](https://pnpm.io) (`corepack enable`)
- A Discord application + bot token — https://discord.com/developers/applications

### Discord setup

1. Create an application → **Bot** → copy the **token** into `DISCORD_TOKEN`.
2. Copy the **Application ID** into `DISCORD_CLIENT_ID`.
3. (Optional, dev) Copy your server id into `DISCORD_GUILD_ID` for instant command
   registration.
4. Invite the bot with the `bot` and `applications.commands` scopes and the
   **Send Messages** + **Embed Links** + **Attach Files** permissions.

## Quick start (Docker — recommended)

```bash
make setup        # creates .env, installs deps, starts Postgres, runs migrations
#   → edit .env and set DISCORD_TOKEN / DISCORD_CLIENT_ID
make up           # builds images and starts postgres + migrate + bot + worker
make logs         # follow the logs
```

Then in Discord, in the channel that should receive videos:

```
/track add url: https://www.youtube.com/@MrBeast
/track list
/track remove url: https://www.youtube.com/@MrBeast
```

## Local development (without Docker for the apps)

```bash
make env          # create .env
make install      # install dependencies
make db-up        # start PostgreSQL in Docker (exposed on localhost:5432)
make migrate      # create & apply the initial migration
make dev          # run bot + worker locally with hot reload
```

You'll need `yt-dlp` and `ffmpeg` on your PATH for the worker locally
(the Docker image installs them for you).

## Useful commands

```bash
make help            # list all targets
make build           # type-check & compile everything
make studio          # open Prisma Studio
make deploy-commands # (re)register slash commands manually
make down            # stop the stack
make nuke            # stop the stack and delete the database volume
```

## Configuration

All configuration is via environment variables (see `.env.example`):

| Variable             | Default          | Description                                            |
| -------------------- | ---------------- | ------------------------------------------------------ |
| `DATABASE_URL`       | —                | PostgreSQL connection string                           |
| `DISCORD_TOKEN`      | —                | Bot token (required)                                   |
| `DISCORD_CLIENT_ID`  | —                | Application id (required to register commands)         |
| `DISCORD_GUILD_ID`   | —                | Optional guild for instant command registration (dev) |
| `POLL_INTERVAL_CRON` | `*/5 * * * *`    | How often sources are polled                           |
| `BACKFILL_LIMIT`     | `3`              | Max videos posted per source on the first poll         |
| `YOUTUBE_INCLUDE_SHORTS` | `true`       | Also post YouTube Shorts (live streams are excluded)   |
| `DOWNLOAD_VIDEOS`    | `false`          | Upload the video file (if < `MAX_UPLOAD_MB`) vs. link  |
| `MAX_UPLOAD_MB`      | `25`             | Discord upload size cap                                 |
| `YTDLP_PATH`         | `yt-dlp`         | Path to the yt-dlp binary                              |

## Notes & limitations

- By default the worker posts the **video link** and lets Discord render the
  inline player (great for YouTube/X/TikTok). Set `DOWNLOAD_VIDEOS=true` to
  upload the file instead when it fits under `MAX_UPLOAD_MB`.
- For YouTube it pulls the **Videos** tab and, with `YOUTUBE_INCLUDE_SHORTS=true`
  (default), the **Shorts** tab too. Live streams are always excluded.
- **Instagram** and some **Twitter/X** sources may require authentication. yt-dlp
  supports `--cookies`; wire `YTDLP_COOKIES` into `apps/worker/src/ytdlp.ts` if needed.
- Scaling out delivery (rate limits, retries at high volume) would be the natural
  place to add a queue (e.g. BullMQ + Redis) later — the `Delivery` table already
  models the work units.
