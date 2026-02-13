import * as dotenv from "dotenv";
import { ForgeSqlCli, CliConfig } from "./index.js";

dotenv.config();

// Parse command line arguments
const args = process.argv.slice(2);
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
