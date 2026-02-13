import { ForgeClient } from "./client.js";
import { ResultFormatter } from "./formatter.js";
import { loadSchema } from "./schema.js";
import chalk from "chalk";

export interface Command {
  name: string;
  description: string;
  execute: (client: ForgeClient, args?: string) => Promise<string>;
}

export const specialCommands: Command[] = [
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
    name: ".indexes",
    description: "Show all indexes",
    execute: async (client: ForgeClient) => {
      const result = await client.execute(
        "SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX, NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() ORDER BY CASE WHEN TABLE_NAME = '__migrations' THEN 1 ELSE 0 END, TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX",
      );
      return ResultFormatter.formatResult(result);
    },
  },
  {
    name: ".migrations",
    description: "List all migrations",
    execute: async (client: ForgeClient) => {
      const result = await client.execute("SELECT * FROM __migrations");
      return ResultFormatter.formatResult(result);
    },
  },
  {
    name: ".database",
    description: "Show the database name",
    execute: async (client: ForgeClient) => {
      const result = await client.execute("SHOW DATABASES");
      return ResultFormatter.formatResult(result);
    },
  },
  {
    name: ".refreshSchema",
    description: "Refresh auto-complete schema cache",
    execute: async (client: ForgeClient) => {
      try {
        const timeMs = await loadSchema(client);
        return chalk.green(`✓ Schema refreshed in ${timeMs}ms`);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return chalk.red(`✗ Failed to refresh schema: ${msg}`);
      }
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
