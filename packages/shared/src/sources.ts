import { Platform } from "@akali/db";
import type { ResolvedSource } from "./types.js";

/**
 * Parse a user-supplied URL into a canonical, trackable source.
 * Pure (no network): the worker later enriches the source via yt-dlp.
 * Returns null when the URL is not a supported channel/account page.
 */
export function parseSourceUrl(input: string): ResolvedSource | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "").toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);

  // ── YouTube ──────────────────────────────────────────────────
  if (host === "youtube.com" || host === "youtu.be") {
    const first = segments[0];
    if (first?.startsWith("@")) {
      return yt(first, first, `https://www.youtube.com/${first}`);
    }
    if (first === "channel" && segments[1]) {
      return yt(segments[1], segments[1], `https://www.youtube.com/channel/${segments[1]}`);
    }
    if ((first === "c" || first === "user") && segments[1]) {
      return yt(segments[1], segments[1], `https://www.youtube.com/${first}/${segments[1]}`);
    }
    return null;
  }

  // ── Instagram ────────────────────────────────────────────────
  if (host === "instagram.com") {
    const user = segments[0];
    const reserved = ["p", "reel", "reels", "explore", "stories", "tv"];
    if (user && !reserved.includes(user)) {
      return {
        platform: Platform.INSTAGRAM,
        externalId: user,
        displayName: `@${user}`,
        url: `https://www.instagram.com/${user}/`,
      };
    }
    return null;
  }

  // ── Twitter / X ──────────────────────────────────────────────
  if (host === "twitter.com" || host === "x.com") {
    const user = segments[0];
    const reserved = ["home", "search", "explore", "i", "messages", "notifications", "settings"];
    if (user && !reserved.includes(user)) {
      return {
        platform: Platform.TWITTER,
        externalId: user,
        displayName: `@${user}`,
        url: `https://x.com/${user}`,
      };
    }
    return null;
  }

  // ── TikTok ───────────────────────────────────────────────────
  if (host === "tiktok.com") {
    const handle = segments[0];
    if (handle?.startsWith("@")) {
      return {
        platform: Platform.TIKTOK,
        externalId: handle,
        displayName: handle,
        url: `https://www.tiktok.com/${handle}`,
      };
    }
    return null;
  }

  return null;
}

function yt(externalId: string, displayName: string, url: string): ResolvedSource {
  return { platform: Platform.YOUTUBE, externalId, displayName, url };
}
