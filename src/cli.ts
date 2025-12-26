import * as dotenv from "dotenv";
import { ForgeSqlCli } from "./index.js";

dotenv.config();

interface CliConfig {
  url?: string;
}

// Parse command line arguments
const args = process.argv.slice(2);
const config: CliConfig = {};

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--url" && args[i + 1]) {
    config.url = args[i + 1];
    i++;
  }
}

const cli = new ForgeSqlCli(config);
cli.start();
