import { Platform } from "@akali/db";
import type { NormalizedVideo } from "@akali/shared";
import { fetchInfo, listLatest, type FlatEntry } from "./ytdlp.js";

/** Build the URL yt-dlp should list to find the latest uploads of a source. */
function listUrlFor(platform: Platform, sourceUrl: string): string {
  switch (platform) {
    case Platform.YOUTUBE:
      // Target the "Videos" tab to avoid the Shorts/Live tabs.
      return `${sourceUrl.replace(/\/+$/, "")}/videos`;
    default:
      return sourceUrl;
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

/** Fetch the latest videos for a source (newest first), as lightweight records. */
export async function fetchLatestVideos(
  platform: Platform,
  sourceUrl: string,
  limit: number,
): Promise<NormalizedVideo[]> {
  const entries = await listLatest(listUrlFor(platform, sourceUrl), limit);
  return entries.map((entry) => ({
    platform,
    externalId: entry.id,
    url: videoUrlFor(platform, entry),
    title: entry.title,
    durationSec: entry.duration,
  }));
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
