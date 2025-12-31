import * as readline from "readline";
import chalk from "chalk";
import { ForgeClient } from "./client.js";
import { ResultFormatter } from "./formatter.js";
import { History } from "./history.js";
import { parseCommand } from "./commands.js";

export { ForgeClient } from "./client.js";
export { executeSql } from "./execute-sql.js";

interface CliConfig {
  url?: string;
}

const getPrimaryPrompt = () => chalk.green("fsql> ");
const getMultilinePrompt = () => chalk.green("      ...> ");

export class ForgeSqlCli {
  private client: ForgeClient;
  private rl: readline.Interface;
  private history: History;
  private multilineBuffer: string = "";
  private isMultiline: boolean = false;

  constructor(config: CliConfig) {
    const url = config.url || process.env.FORGE_SQL_WEBTRIGGER;

    if (!url) {
      console.error(chalk.red("Error: FORGE_SQL_WEBTRIGGER not configured"));
      console.error(
        chalk.yellow("Set it via environment variable or .env file"),
      );
      process.exit(1);
    }

    this.client = new ForgeClient({
      url,
    });

    this.history = new History();

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: getPrimaryPrompt(),
      history: this.history.getAll().reverse(),
      historySize: 1000,
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
    console.log(chalk.bold.blue("Forge FSQL CLI"));
    console.log(chalk.gray("Type .help for commands, exit to quit"));
    console.log(chalk.gray("=".repeat(50)));

    process.stdout.write("Connecting ... ");
    const connected = await this.client.testConnection();

    if (connected) {
      console.log(chalk.green("✓ Connected"));
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
