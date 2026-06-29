import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { REST, Routes } from "discord.js";
import { DeliveryStatus, prisma } from "@akali/db";
import type { Prisma } from "@akali/db";
import { env } from "@akali/config";
import { createLogger, truncate } from "@akali/shared";
import { maybeDownload } from "./download.js";

const log = createLogger("worker:poster");
const rest = new REST().setToken(env.DISCORD_TOKEN);

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 50;

type PendingDelivery = Prisma.DeliveryGetPayload<{
  include: { video: true; subscription: true };
}>;

/** Send all pending deliveries to their Discord channels. */
export async function deliverPending(): Promise<void> {
  const pending = await prisma.delivery.findMany({
    where: { status: DeliveryStatus.PENDING },
    include: { video: true, subscription: true },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });

  if (pending.length === 0) return;
  log.info(`Delivering ${pending.length} pending video(s)`);

  for (const delivery of pending) {
    await deliverOne(delivery);
  }
}

async function deliverOne(delivery: PendingDelivery): Promise<void> {
  const { video, subscription } = delivery;

  const author = video.author ? ` — **${video.author}**` : "";
  const title = truncate(video.title ?? "Nouvelle vidéo", 240);
  const content = `🔴 **Nouvelle vidéo**${author}\n**${title}**\n${video.url}`;

  try {
    const file = await maybeDownload(video.url, video.externalId);
    const files = file
      ? [{ name: basename(file.path), data: await readFile(file.path) }]
      : undefined;

    const message = (await rest.post(Routes.channelMessages(subscription.discordChannelId), {
      body: { content },
      files,
    })) as { id: string };

    await file?.cleanup();

    await prisma.delivery.update({
      where: { id: delivery.id },
      data: {
        status: DeliveryStatus.SENT,
        discordMessageId: message.id,
        sentAt: new Date(),
        attempts: { increment: 1 },
      },
    });
  } catch (err) {
    const willRetry = delivery.attempts + 1 < MAX_ATTEMPTS;
    log.error(
      { err, channel: subscription.discordChannelId, video: video.url },
      "Failed to deliver video",
    );
    await prisma.delivery.update({
      where: { id: delivery.id },
      data: {
        status: willRetry ? DeliveryStatus.PENDING : DeliveryStatus.FAILED,
        attempts: { increment: 1 },
        error: (err instanceof Error ? err.message : String(err)).slice(0, 500),
      },
    });
  }
}
