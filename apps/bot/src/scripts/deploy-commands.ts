import { createLogger } from "@akali/shared";
import { registerCommands } from "../register.js";

const log = createLogger("bot:deploy-commands");

registerCommands()
  .then(() => process.exit(0))
  .catch((err) => {
    log.error({ err }, "Failed to register commands");
    process.exit(1);
  });
