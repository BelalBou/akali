import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { env } from "@akali/config";
import { downloadVideo } from "./ytdlp.js";

export interface DownloadedFile {
  path: string;
  sizeBytes: number;
  cleanup: () => Promise<void>;
}

/**
 * Download a video for upload to Discord when DOWNLOAD_VIDEOS is enabled and
 * the resulting file fits under MAX_UPLOAD_MB. Returns null otherwise (the
 * caller then falls back to posting a link).
 */
export async function maybeDownload(
  videoUrl: string,
  externalId: string,
): Promise<DownloadedFile | null> {
  if (!env.DOWNLOAD_VIDEOS) return null;

  const dir = join(tmpdir(), "akali", externalId);
  const cleanup = () => rm(dir, { recursive: true, force: true });

  await mkdir(dir, { recursive: true });
  try {
    await downloadVideo(videoUrl, dir, env.MAX_UPLOAD_MB);

    const files = await readdir(dir);
    const file = files.find((name) => name.startsWith(`${externalId}.`));
    if (!file) {
      await cleanup();
      return null;
    }

    const path = join(dir, file);
    const info = await stat(path);
    if (info.size > env.MAX_UPLOAD_MB * 1024 * 1024) {
      await cleanup();
      return null;
    }

    return { path, sizeBytes: info.size, cleanup };
  } catch {
    await cleanup().catch(() => undefined);
    return null;
  }
}
