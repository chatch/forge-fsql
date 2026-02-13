import * as readline from "readline";
import chalk from "chalk";
import { ForgeClient } from "./client.js";
import { ResultFormatter } from "./formatter.js";
import { History } from "./history.js";
import { parseCommand } from "./commands.js";
import { completer } from "./completer.js";
import { loadSchema } from "./schema.js";

export { ForgeClient } from "./client.js";
export { executeSql } from "./execute-sql.js";

export interface CliConfig {
  url?: string;
  skipSchemaLoad?: boolean;
}

const getPrimaryPrompt = () => chalk.green("fsql> ");
const getMultilinePrompt = () => chalk.green("      ...> ");

export class ForgeSqlCli {
  private client: ForgeClient;
  private rl: readline.Interface;
  private history: History;
  private multilineBuffer: string = "";
  private isMultiline: boolean = false;
  private skipSchemaLoad: boolean = false;
  private url?: string;

  constructor(config: CliConfig) {
    this.url = config.url || process.env.FORGE_SQL_WEBTRIGGER;
    this.skipSchemaLoad = !!config.skipSchemaLoad;

    this.client = new ForgeClient({
      url: this.url || "",
    });

    this.history = new History();

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: getPrimaryPrompt(),
      history: this.history.getAll().reverse(),
      historySize: 1000,
      completer,
    });

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.rl.on("line", (line) => this.handleLine(line));
    this.rl.on("close", () => this.handleClose());

    // Handle Ctrl+C
    this.rl.on("SIGINT", () => {
      if (this.isMultiline) {
        console.log("\n" + chalk.yellow("Multi-line input cancelled"));
        this.multilineBuffer = "";
        this.isMultiline = false;
        this.rl.setPrompt(getPrimaryPrompt());
      } else {
        console.log("\n" + chalk.gray("(Use .exit, exit, or Ctrl+D to quit)"));
      }
      this.rl.prompt();
    });
  }

  private async handleLine(line: string): Promise<void> {
    const input = line.trim();

    // Handle exit commands
    if (input === "exit" || input === "quit" || input === ".exit") {
      this.rl.close();
      return;
    }

    // Handle empty input
    if (!input) {
      this.rl.prompt();
      return;
    }

    // Check for multi-line SQL (doesn't end with semicolon)
    if (!this.isMultiline && !input.endsWith(";") && !input.startsWith(".")) {
      this.isMultiline = true;
      this.multilineBuffer = input;
      this.rl.setPrompt(getMultilinePrompt());
      this.rl.prompt();
      return;
    }

    // Continue multi-line
    if (this.isMultiline) {
      this.multilineBuffer += "\n" + input;

      if (input.endsWith(";")) {
        const fullSql = this.multilineBuffer;
        this.multilineBuffer = "";
        this.isMultiline = false;
        this.rl.setPrompt(getPrimaryPrompt());

        await this.executeCommand(fullSql);
      } else {
        this.rl.prompt();
        return;
      }
    } else {
      await this.executeCommand(input);
    }

    this.rl.prompt();
  }

  private async executeCommand(input: string): Promise<void> {
    this.history.add(input);

    // Check for special commands
    const { command, args, isSpecial } = parseCommand(input);

    if (isSpecial) {
      if (command) {
        const result = await command.execute(this.client, args);
        console.log(result);
      } else {
        console.log(
          chalk.red("Unknown command. Type .help for available commands"),
        );
      }
      return;
    }

    // Execute SQL
    const result = await this.client.execute(input);
    console.log(ResultFormatter.formatResult(result));

    if (result.metadata?.queryTime) {
      console.log(ResultFormatter.formatQueryTime(result.metadata.queryTime));
    }
  }

  private handleClose(): void {
    this.history.save();
    console.log(chalk.gray("\nGoodbye!"));
    process.exit(0);
  }

  async start(): Promise<void> {
    if (!this.url) {
      console.error(chalk.red("Error: FORGE_SQL_WEBTRIGGER not configured"));
      console.error(
        "Try rerunning 'fsql-setup'.\n\nSee the Installation docs at https://github.com/chatch/forge-fsql?tab=readme-ov-file#installation",
      );
      process.exit(1);
    }

    console.log(chalk.bold.blue("Forge FSQL CLI"));
    console.log("");
    console.log("Type .help for commands, exit to quit");
    console.log("");

    process.stdout.write(chalk.gray("Connecting ... "));
    const connectionStart = Date.now();
    const connected = await this.client.testConnection();
    const connectionTime = Date.now() - connectionStart;

    if (connected) {
      console.log(chalk.green(`✓ Connected (${connectionTime}ms)`));

      // Load schema for auto-completion
      if (!this.skipSchemaLoad) {
        process.stdout.write(
          chalk.gray(
            "Loading schema for autocompletions (--skip-schema-load bypasses this) ... ",
          ),
        );
        try {
          const loadTimeMs = await loadSchema(this.client);
          console.log(chalk.green(`✓ Done (${loadTimeMs}ms)`));
        } catch {
          console.log(chalk.gray("⚠ Failed (autocompletion unavailable)"));
        }
      }
    } else {
      console.log(chalk.red("✗ Connection failed"));
      console.log(
        chalk.yellow("Check your FORGE_SQL_WEBTRIGGER configuration"),
      );
    }

    console.log("");
    this.rl.prompt();
  }
}
