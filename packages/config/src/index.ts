import { config as loadDotenv } from "dotenv";
import { z } from "zod";

// Load variables from a local .env file when present (no-op in containers,
// where the environment is provided by docker compose).
loadDotenv();

/** Parse the common "true"/"false"/"1"/"0" string env values into a boolean. */
const booleanString = z
  .union([z.boolean(), z.string()])
  .transform((value) => value === true || value === "true" || value === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  // Database
  DATABASE_URL: z.string().url(),

  // Discord
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  DISCORD_CLIENT_ID: z.string().min(1).optional(),
  DISCORD_GUILD_ID: z.string().min(1).optional(),

  // Worker
  POLL_INTERVAL_CRON: z.string().default("*/5 * * * *"),
  BACKFILL_LIMIT: z.coerce.number().int().min(0).default(3),
  // YouTube: also pull the "Shorts" tab (live streams are always excluded).
  YOUTUBE_INCLUDE_SHORTS: booleanString.default(true),
  DOWNLOAD_VIDEOS: booleanString.default(false),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(25),
  YTDLP_PATH: z.string().default("yt-dlp"),
});

export type Env = z.infer<typeof schema>;

function loadEnv(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}

/** Validated, typed environment. Throws at import time if anything is missing. */
export const env: Env = loadEnv();
