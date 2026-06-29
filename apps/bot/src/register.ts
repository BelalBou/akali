import { REST, Routes } from "discord.js";
import { env } from "@akali/config";
import { createLogger } from "@akali/shared";
import { commandsBody } from "./commands/index.js";

const log = createLogger("bot:register");

/**
 * Register the bot's slash commands with Discord.
 * Uses guild-scoped registration when DISCORD_GUILD_ID is set (instant,
 * great for development), otherwise registers globally.
 */
export async function registerCommands(): Promise<void> {
  if (!env.DISCORD_CLIENT_ID) {
    log.warn("DISCORD_CLIENT_ID not set — skipping slash command registration");
    return;
  }

  const body = commandsBody();
  const rest = new REST().setToken(env.DISCORD_TOKEN);

  if (env.DISCORD_GUILD_ID) {
    await rest.put(
      Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID),
      { body },
    );
    log.info(`Registered ${body.length} guild command(s) in guild ${env.DISCORD_GUILD_ID}`);
  } else {
    await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body });
    log.info(`Registered ${body.length} global command(s)`);
  }
}
