import { Platform } from "@akali/db";
import { createLogger, type NormalizedVideo } from "@akali/shared";
import { env } from "@akali/config";
import { fetchInfo, listLatest, type FlatEntry } from "./ytdlp.js";

const log = createLogger("worker:providers");

/**
 * Build the URL(s) yt-dlp should list to find the latest uploads of a source.
 * A YouTube channel exposes separate tabs: "Videos" (long-form) and "Shorts".
 * We always pull Videos, optionally Shorts; live streams are left out.
 */
function listUrlsFor(platform: Platform, sourceUrl: string): string[] {
  const base = sourceUrl.replace(/\/+$/, "");
  switch (platform) {
    case Platform.YOUTUBE: {
      const urls = [`${base}/videos`];
      if (env.YOUTUBE_INCLUDE_SHORTS) urls.push(`${base}/shorts`);
      return urls;
    }
    default:
      return [sourceUrl];
  }
}

/** Build a canonical, openable video URL from a flat entry. */
function videoUrlFor(platform: Platform, entry: FlatEntry): string {
  if (entry.url?.startsWith("http")) return entry.url;
  switch (platform) {
    case Platform.YOUTUBE:
      return `https://www.youtube.com/watch?v=${entry.id}`;
    default:
      return entry.url ?? entry.id;
  }
}

function parseUploadDate(yyyymmdd?: string): Date | undefined {
  if (!yyyymmdd || yyyymmdd.length !== 8) return undefined;
  const year = Number(yyyymmdd.slice(0, 4));
  const month = Number(yyyymmdd.slice(4, 6));
  const day = Number(yyyymmdd.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Fetch the latest videos for a source (newest first), as lightweight records.
 * For YouTube this merges the Videos and (optionally) Shorts tabs, de-duplicated
 * by video id.
 */
export async function fetchLatestVideos(
  platform: Platform,
  sourceUrl: string,
  limit: number,
): Promise<NormalizedVideo[]> {
  const merged = new Map<string, NormalizedVideo>();

  for (const listUrl of listUrlsFor(platform, sourceUrl)) {
    let entries: FlatEntry[];
    try {
      entries = await listLatest(listUrl, limit);
    } catch (err) {
      // A channel may not expose every tab (e.g. no /shorts) — skip that listing.
      log.debug({ err, listUrl }, "Listing failed, skipping");
      continue;
    }

    for (const entry of entries) {
      if (!entry.id || merged.has(entry.id)) continue;
      merged.set(entry.id, {
        platform,
        externalId: entry.id,
        url: videoUrlFor(platform, entry),
        title: entry.title,
        durationSec: entry.duration,
      });
    }
  }

  return [...merged.values()];
}

/** Best-effort enrichment of a video with full metadata (thumbnail, date, ...). */
export async function enrich(video: NormalizedVideo): Promise<NormalizedVideo> {
  try {
    const info = await fetchInfo(video.url);
    if (!info) return video;
    return {
      ...video,
      title: info.title ?? video.title,
      description: info.description,
      thumbnailUrl: info.thumbnail,
      author: info.uploader ?? info.channel,
      durationSec: info.duration ?? video.durationSec,
      publishedAt: info.timestamp
        ? new Date(info.timestamp * 1000)
        : parseUploadDate(info.upload_date),
      url: info.webpage_url ?? video.url,
    };
  } catch {
    return video; // enrichment is optional; never block delivery on it
  }
}
