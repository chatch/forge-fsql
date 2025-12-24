import { ForgeClient } from "./client";
import { ResultFormatter } from "./formatter";
import chalk from "chalk";

export interface Command {
  name: string;
  description: string;
  execute: (client: ForgeClient, args?: string) => Promise<string>;
}

export const specialCommands: Command[] = [
  {
    name: ".tables",
    description: "List all tables",
    execute: async (client: ForgeClient) => {
      const result = await client.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()",
      );
      return ResultFormatter.formatResult(result);
    },
  },
  {
    name: ".describe",
    description: "Describe a table (.describe table_name)",
    execute: async (client: ForgeClient, args?: string) => {
      if (!args) {
        return chalk.yellow("Usage: .describe <table_name>");
      }
      const result = await client.execute(`DESCRIBE ${args}`);
      return ResultFormatter.formatResult(result);
    },
  },
  {
    name: ".schema",
    description: "Show database schema",
    execute: async (client: ForgeClient) => {
      const result = await client.execute(
        "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = DATABASE() ORDER BY table_name, ordinal_position",
      );
      return ResultFormatter.formatResult(result);
    },
  },
  {
    name: ".help",
    description: "Show available commands",
    execute: async () => {
      const helpText = [
        chalk.bold("Special Commands:"),
        ...specialCommands.map(
          (cmd) => `  ${chalk.cyan(cmd.name.padEnd(15))} ${cmd.description}`,
        ),
        "",
        chalk.bold("Other:"),
        `  ${chalk.cyan("exit, quit".padEnd(15))} Exit the CLI`,
        `  ${chalk.cyan("Ctrl+C".padEnd(15))} Cancel current query`,
        `  ${chalk.cyan("Ctrl+D".padEnd(15))} Exit the CLI`,
        `  ${chalk.cyan("↑/↓".padEnd(15))} Navigate command history`,
      ];
      return helpText.join("\n");
    },
  },
];

export function parseCommand(input: string): {
  command?: Command;
  args?: string;
  isSpecial: boolean;
} {
  const trimmed = input.trim();

  if (trimmed.startsWith(".")) {
    const parts = trimmed.split(/\s+/);
    const cmdName = parts[0];
    const args = parts.slice(1).join(" ");

    const command = specialCommands.find((c) => c.name === cmdName);
    return { command, args, isSpecial: true };
  }

  return { isSpecial: false };
}