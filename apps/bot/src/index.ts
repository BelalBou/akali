import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { env } from "@akali/config";
import { createLogger } from "@akali/shared";
import { prisma } from "@akali/db";
import { commands } from "./commands/index.js";
import { registerCommands } from "./register.js";

const log = createLogger("bot");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async (c) => {
  log.info(`Logged in as ${c.user.tag} (${c.user.id})`);
  try {
    await registerCommands();
  } catch (err) {
    log.error({ err }, "Failed to register slash commands");
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) {
    log.warn(`Unknown command: ${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    log.error({ err }, `Error while handling /${interaction.commandName}`);
    const content = "❌ Une erreur est survenue.";
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral }).catch(() => undefined);
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => undefined);
    }
  }
});

async function shutdown(signal: string): Promise<void> {
  log.info(`Received ${signal}, shutting down...`);
  await client.destroy();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

client.login(env.DISCORD_TOKEN).catch((err) => {
  log.error({ err }, "Fatal error while starting the bot");
  process.exit(1);
});
