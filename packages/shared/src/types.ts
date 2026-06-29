import type { Platform } from "@akali/db";

/** A video as returned by a platform provider, before it is persisted. */
export interface NormalizedVideo {
  platform: Platform;
  /** Platform-specific video id. */
  externalId: string;
  url: string;
  title?: string;
  description?: string;
  thumbnailUrl?: string;
  author?: string;
  durationSec?: number;
  publishedAt?: Date;
}

/** A source URL resolved into a canonical, trackable reference. */
export interface ResolvedSource {
  platform: Platform;
  url: string;
  /** Stable platform identifier (channel id, @handle, user id, ...). */
  externalId: string;
  displayName?: string;
}

/** Contract implemented by every platform provider in the worker. */
export interface VideoProvider {
  readonly platform: Platform;
  /** Returns true if this provider can handle the given URL. */
  matches(url: string): boolean;
  /** Turn a user-supplied URL into a canonical, trackable source. */
  resolve(url: string): Promise<ResolvedSource>;
  /** Fetch the latest videos for a source, newest first. */
  fetchLatest(source: ResolvedSource, limit: number): Promise<NormalizedVideo[]>;
}
