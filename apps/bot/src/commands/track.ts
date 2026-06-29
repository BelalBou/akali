import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { Platform, Prisma, prisma } from "@akali/db";
import { parseSourceUrl } from "@akali/shared";
import type { Command } from "./index.js";

const PLATFORM_LABELS: Record<Platform, string> = {
  [Platform.YOUTUBE]: "YouTube",
  [Platform.INSTAGRAM]: "Instagram",
  [Platform.TWITTER]: "Twitter / X",
  [Platform.TIKTOK]: "TikTok",
};

export const track: Command = {
  data: new SlashCommandBuilder()
    .setName("track")
    .setDescription("Gère les sources vidéo suivies dans ce salon")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Suivre une chaîne / un compte dans ce salon")
        .addStringOption((o) =>
          o
            .setName("url")
            .setDescription("URL d'une chaîne YouTube ou d'un compte Instagram / Twitter / TikTok")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Ne plus suivre une source dans ce salon")
        .addStringOption((o) =>
          o.setName("url").setDescription("URL de la source à retirer").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("Lister les sources suivies dans ce salon"),
    ),

  async execute(interaction) {
    switch (interaction.options.getSubcommand()) {
      case "add":
        return addSource(interaction);
      case "remove":
        return removeSource(interaction);
      case "list":
        return listSources(interaction);
    }
  },
};

async function addSource(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "Cette commande s'utilise dans un serveur.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const url = interaction.options.getString("url", true);
  const resolved = parseSourceUrl(url);
  if (!resolved) {
    await interaction.reply({
      content:
        "❌ URL non reconnue. Plateformes supportées : **YouTube** (chaîne), **Instagram**, **Twitter / X**, **TikTok** (compte).",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const source = await prisma.source.upsert({
    where: {
      platform_externalId: {
        platform: resolved.platform,
        externalId: resolved.externalId,
      },
    },
    create: {
      platform: resolved.platform,
      externalId: resolved.externalId,
      url: resolved.url,
      displayName: resolved.displayName,
    },
    update: { enabled: true },
  });

  try {
    await prisma.subscription.create({
      data: {
        sourceId: source.id,
        guildId: interaction.guildId,
        discordChannelId: interaction.channelId,
        createdBy: interaction.user.id,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      await interaction.editReply(
        `ℹ️ Ce salon suit déjà **${source.displayName ?? source.url}**.`,
      );
      return;
    }
    throw err;
  }

  await interaction.editReply(
    `✅ Ce salon suit maintenant **${PLATFORM_LABELS[resolved.platform]}** → ${source.displayName ?? source.url}\n` +
      "Les nouvelles vidéos seront postées ici automatiquement.",
  );
}

async function removeSource(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "Cette commande s'utilise dans un serveur.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const url = interaction.options.getString("url", true);
  const resolved = parseSourceUrl(url);
  if (!resolved) {
    await interaction.reply({
      content: "❌ URL non reconnue.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const source = await prisma.source.findUnique({
    where: {
      platform_externalId: {
        platform: resolved.platform,
        externalId: resolved.externalId,
      },
    },
  });

  const deleted = source
    ? await prisma.subscription.deleteMany({
        where: { sourceId: source.id, discordChannelId: interaction.channelId },
      })
    : { count: 0 };

  if (deleted.count === 0) {
    await interaction.editReply("ℹ️ Ce salon ne suivait pas cette source.");
    return;
  }

  await interaction.editReply(
    `🗑️ Ce salon ne suit plus **${source?.displayName ?? resolved.url}**.`,
  );
}

async function listSources(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "Cette commande s'utilise dans un serveur.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const subscriptions = await prisma.subscription.findMany({
    where: { discordChannelId: interaction.channelId },
    include: { source: true },
    orderBy: { createdAt: "asc" },
  });

  if (subscriptions.length === 0) {
    await interaction.editReply(
      "Aucune source suivie dans ce salon. Ajoutez-en une avec `/track add`.",
    );
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("📺 Sources suivies dans ce salon")
    .setColor(0x5865f2)
    .setDescription(
      subscriptions
        .map(
          (s, i) =>
            `**${i + 1}.** ${PLATFORM_LABELS[s.source.platform]} — [${s.source.displayName ?? s.source.url}](${s.source.url})`,
        )
        .join("\n"),
    );

  await interaction.editReply({ embeds: [embed] });
}
