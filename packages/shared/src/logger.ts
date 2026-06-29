import { env } from "@akali/config";
import { pino, type Logger } from "pino";

export const logger: Logger = pino({
  level: env.LOG_LEVEL,
  ...(env.NODE_ENV === "development"
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
      }
    : {}),
});

/** Create a child logger tagged with a component/service name. */
export function createLogger(name: string): Logger {
  return logger.child({ name });
}
