import { prisma } from "@akali/db";
import type { Source } from "@akali/db";
import { env } from "@akali/config";
import { createLogger } from "@akali/shared";
import { enrich, fetchLatestVideos } from "./providers.js";
import { deliverPending } from "./poster.js";

const log = createLogger("worker:poll");

// Number of recent items inspected on every regular poll.
const POLL_WINDOW = 15;

let running = false;

/** Poll every enabled source once, then flush pending deliveries. */
export async function pollOnce(): Promise<void> {
  if (running) {
    log.warn("Previous poll still running — skipping this tick");
    return;
  }
  running = true;
  try {
    const sources = await prisma.source.findMany({ where: { enabled: true } });
    log.info(`Polling ${sources.length} source(s)`);
    for (const source of sources) {
      await pollSource(source);
    }
    await deliverPending();
  } finally {
    running = false;
  }
}

async function pollSource(source: Source): Promise<void> {
  const firstRun = source.lastCheckedAt === null;
  const limit = firstRun ? Math.max(env.BACKFILL_LIMIT, 1) : POLL_WINDOW;

  try {
    const latest = await fetchLatestVideos(source.platform, source.url, limit);
    if (latest.length === 0) {
      await touch(source.id);
      return;
    }

    const known = new Set(
      (
        await prisma.video.findMany({
          where: {
            platform: source.platform,
            externalId: { in: latest.map((v) => v.externalId) },
          },
          select: { externalId: true },
        })
      ).map((v) => v.externalId),
    );

    const fresh = latest.filter((v) => !known.has(v.externalId));

    // On the very first poll, only deliver the newest BACKFILL_LIMIT videos.
    // The rest are still recorded (so they are not re-posted later).
    const deliverIds = new Set(
      (firstRun ? fresh.slice(0, env.BACKFILL_LIMIT) : fresh).map((v) => v.externalId),
    );

    // Record oldest → newest so messages land in chronological order.
    for (const video of [...fresh].reverse()) {
      const willDeliver = deliverIds.has(video.externalId);
      const data = willDeliver ? await enrich(video) : video;

      const created = await prisma.video.create({
        data: {
          sourceId: source.id,
          platform: source.platform,
          externalId: data.externalId,
          url: data.url,
          title: data.title,
          description: data.description?.slice(0, 4000),
          thumbnailUrl: data.thumbnailUrl,
          author: data.author,
          durationSec: data.durationSec,
          publishedAt: data.publishedAt,
        },
      });

      if (willDeliver) {
        const subs = await prisma.subscription.findMany({ where: { sourceId: source.id } });
        if (subs.length > 0) {
          await prisma.delivery.createMany({
            data: subs.map((s) => ({ videoId: created.id, subscriptionId: s.id })),
            skipDuplicates: true,
          });
        }
        log.info(
          `New video for ${source.displayName ?? source.url}: ${data.title ?? data.url}`,
        );
      }
    }

    await touch(source.id);
  } catch (err) {
    log.error({ err, source: source.url }, "Failed to poll source");
  }
}

function touch(sourceId: string): Promise<unknown> {
  return prisma.source.update({
    where: { id: sourceId },
    data: { lastCheckedAt: new Date() },
  });
}
