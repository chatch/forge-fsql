import * as dotenv from "dotenv";
import { ForgeSqlCli, CliConfig } from "./index.js";
import { readFileSync } from "fs";

dotenv.config();

// Parse command line arguments
const args = process.argv.slice(2);

// Check for help/version flags early
if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Forge FSQL CLI - Interactive SQL for Atlassian Forge

Usage:
  fsql [options]

Options:
  --version, -V        Show version
  --help, -h           Show this help
  --url <url>          Webtrigger URL (overrides FORGE_SQL_WEBTRIGGER)
  --skip-schema-load   Bypass schema loading for autocompletion

Environment:
  FORGE_SQL_WEBTRIGGER Webtrigger URL for the Forge app
  `);
  process.exit(0);
}

if (args.includes("--version") || args.includes("-V")) {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  console.log(packageJson.version);
  process.exit(0);
}

const config: CliConfig = {};

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--url" && args[i + 1]) {
    config.url = args[i + 1];
    i++;
  } else if (args[i] === "--skip-schema-load") {
    config.skipSchemaLoad = true;
  }
}

const cli = new ForgeSqlCli(config);
cli.start();
