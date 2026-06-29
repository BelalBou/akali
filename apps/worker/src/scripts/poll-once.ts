import { createLogger } from "@akali/shared";
import { prisma } from "@akali/db";
import { pollOnce } from "../poller.js";

const log = createLogger("worker:poll-once");

pollOnce()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch((err) => {
    log.error({ err }, "poll-once failed");
    process.exit(1);
  });
