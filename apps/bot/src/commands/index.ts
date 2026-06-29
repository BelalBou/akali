import {
  Collection,
  type ChatInputCommandInteraction,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  type SlashCommandBuilder,
  type SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";
import { track } from "./track.js";

export interface Command {
  data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

export const commands = new Collection<string, Command>();
for (const command of [track]) {
  commands.set(command.data.name, command);
}

/** Serialize all commands to the REST payload used for registration. */
export function commandsBody(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  return [...commands.values()].map((command) => command.data.toJSON());
}
