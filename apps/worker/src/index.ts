import cron from "node-cron";
import { env } from "@akali/config";
import { createLogger } from "@akali/shared";
import { prisma } from "@akali/db";
import { pollOnce } from "./poller.js";

const log = createLogger("worker");

async function main(): Promise<void> {
  if (!cron.validate(env.POLL_INTERVAL_CRON)) {
    throw new Error(`Invalid POLL_INTERVAL_CRON: "${env.POLL_INTERVAL_CRON}"`);
  }

  log.info(`Worker starting (poll schedule: "${env.POLL_INTERVAL_CRON}")`);

  // Run immediately on boot, then on schedule.
  await pollOnce().catch((err) => log.error({ err }, "Initial poll failed"));

  cron.schedule(env.POLL_INTERVAL_CRON, () => {
    pollOnce().catch((err) => log.error({ err }, "Scheduled poll failed"));
  });

  log.info("Worker ready.");
}

async function shutdown(signal: string): Promise<void> {
  log.info(`Received ${signal}, shutting down...`);
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

main().catch((err) => {
  log.error({ err }, "Fatal worker error");
  process.exit(1);
});
