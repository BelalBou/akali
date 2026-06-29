import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { env } from "@akali/config";

const execFileAsync = promisify(execFile);

const MAX_BUFFER = 64 * 1024 * 1024; // 64 MiB of JSON output
const TIMEOUT_MS = 120_000;

/** Minimal entry returned by a flat playlist listing. */
export interface FlatEntry {
  id: string;
  title?: string;
  url?: string;
  duration?: number;
}

/** Rich metadata for a single video. */
export interface FullInfo {
  id: string;
  title?: string;
  description?: string;
  webpage_url?: string;
  thumbnail?: string;
  uploader?: string;
  channel?: string;
  duration?: number;
  /** YYYYMMDD */
  upload_date?: string;
  /** Unix seconds */
  timestamp?: number;
}

async function runYtdlp(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(env.YTDLP_PATH, args, {
    maxBuffer: MAX_BUFFER,
    timeout: TIMEOUT_MS,
  });
  return stdout;
}

/** List the latest entries from a channel/account URL (cheap, no per-video resolution). */
export async function listLatest(listUrl: string, limit: number): Promise<FlatEntry[]> {
  const stdout = await runYtdlp([
    "--flat-playlist",
    "--dump-json",
    "--playlist-end",
    String(limit),
    "--ignore-errors",
    "--no-warnings",
    listUrl,
  ]);
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as FlatEntry);
}

/** Resolve full metadata for a single video URL. Returns null on empty output. */
export async function fetchInfo(videoUrl: string): Promise<FullInfo | null> {
  const stdout = await runYtdlp([
    "--dump-single-json",
    "--no-playlist",
    "--no-warnings",
    videoUrl,
  ]);
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  return JSON.parse(trimmed) as FullInfo;
}

/**
 * Download a video into `outDir` (capped at `maxMb`), naming it `<id>.<ext>`.
 * Resolves to nothing; the caller locates the produced file in `outDir`.
 */
export async function downloadVideo(videoUrl: string, outDir: string, maxMb: number): Promise<void> {
  await runYtdlp([
    "-f",
    `b[filesize<${maxMb}M]/bv*[filesize<${maxMb}M]+ba/b`,
    "--max-filesize",
    `${maxMb}M`,
    "--merge-output-format",
    "mp4",
    "-o",
    join(outDir, "%(id)s.%(ext)s"),
    "--no-warnings",
    "--no-playlist",
    videoUrl,
  ]);
}
