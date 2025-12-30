#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import chalk from "chalk";
import ora from "ora";
import prompts from "prompts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkgRoot = path.join(__dirname, "..");
const templatesDir = path.join(pkgRoot, "templates");

// Support both ESM and CJS imports for js-yaml
const require = createRequire(import.meta.url);
const YAML = require("yaml");

const projectRoot = process.cwd();

async function main() {
  console.log(chalk.bold.blue("\n🚀 Forge SQL CLI Setup\n"));

  // Detect consumer project type
  let isEsm = false;
  let isTypeScript = fs.existsSync(path.join(projectRoot, "tsconfig.json"));

  try {
    const pkgPath = path.join(projectRoot, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      if (pkg.type === "module") {
        isEsm = true;
      }

      // Check for @forge/sql dependency
      const hasForgeSql =
        (pkg.dependencies && pkg.dependencies["@forge/sql"]) ||
        (pkg.devDependencies && pkg.devDependencies["@forge/sql"]);

      if (!hasForgeSql) {
        console.error(chalk.red("\n❌ Error: @forge/sql is not installed."));
        console.log(
          chalk.yellow(
            "This tool requires @forge/sql to be present in your project.",
          ),
        );
        console.log("Please install it by running:");
        console.log(chalk.blue("\n  npm install @forge/sql"));
        console.log("  # or");
        console.log(chalk.blue("  yarn add @forge/sql\n"));
        process.exit(1);
      }
    } else {
      console.error(chalk.red("\n❌ Error: package.json not found."));
      console.log(
        chalk.yellow(
          "This tool requires a valid Node.js project with @forge/sql installed.",
        ),
      );
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.yellow("Warning: Could not read package.json:"), error);
  }

  // 1. Detect manifest.yaml or manifest.yml
  let manifestPath = path.join(projectRoot, "manifest.yml");
  if (!fs.existsSync(manifestPath)) {
    manifestPath = path.join(projectRoot, "manifest.yaml");
  }

  if (!fs.existsSync(manifestPath)) {
    console.error(
      chalk.red(
        "Error: Could not find manifest.yml or manifest.yaml in the current directory.",
      ),
    );
    process.exit(1);
  }

  // 2. Prompt for fsql execution function path
  const extension = isTypeScript ? "ts" : isEsm ? "js" : "js";
  const defaultPath = `src/fsql.${extension}`;

  const response = await prompts({
    type: "text",
    name: "fsqlPath",
    message: "Where should the SQL execution function be created?",
    initial: defaultPath,
  });

  if (!response.fsqlPath) {
    console.log(chalk.yellow("Setup cancelled."));
    process.exit(0);
  }

  const fsqlRelPath = response.fsqlPath;
  const fsqlAbsPath = path.resolve(projectRoot, fsqlRelPath);
  const srcSameDir = path.dirname(fsqlAbsPath);

  // Spinner for file creation
  const spinner = ora("Creating function file...").start();

  if (!fs.existsSync(srcSameDir)) {
    fs.mkdirSync(srcSameDir, { recursive: true });
  }

  let templateFile = "";
  if (isTypeScript) {
    templateFile = "execute-sql.ts";
  } else if (isEsm) {
    templateFile = "execute-sql.js";
  } else {
    templateFile = "execute-sql.cjs";
  }

  const fsqlContent = fs.readFileSync(
    path.join(templatesDir, templateFile),
    "utf8",
  );

  const fileExists = fs.existsSync(fsqlAbsPath);
  fs.writeFileSync(fsqlAbsPath, fsqlContent);

  if (fileExists) {
    spinner.succeed(`Updated ${fsqlRelPath}`);
  } else {
    spinner.succeed(`Created ${fsqlRelPath}`);
  }

  // 3. Update manifest
  spinner.start("Updating manifest.yml...");

  let doc;
  try {
    const fileContents = fs.readFileSync(manifestPath, "utf8");
    doc = YAML.parseDocument(fileContents);
  } catch (e) {
    spinner.fail("Error reading manifest");
    console.error(e);
    process.exit(1);
  }

  if (!doc.contents) {
    doc.contents = doc.createNode({});
  }

  if (!doc.has("modules")) {
    doc.set("modules", doc.createNode({}));
  }

  const modules = doc.get("modules");

  const functionKey = "executeSql";
  if (!modules.has("function")) {
    modules.set("function", doc.createNode([]));
  }

  let functions = modules.get("function");

  if (!YAML.isSeq(functions)) {
    const obj = functions.toJSON();
    functions = doc.createNode(
      Object.entries(obj).map(([key, val]) => ({ key, ...val })),
    );
    modules.set("function", functions);
  }

  // Determine handler path
  // Standard Forge pattern: filename without extension + .functionName
  // We need to be careful with paths.
  // If user chooses src/foo/bar.ts, handler is src/foo/bar.executeSql
  // If user chooses modules/bar.js, handler is modules/bar.executeSql

  // 145. Determine handler path
  let handlerPath = fsqlRelPath.replace(/\.(ts|js|cjs|mjs)$/, "");
  // Ensure we use forward slashes for handler paths
  handlerPath = handlerPath.split(path.sep).join("/");

  // Logic to detect if we should strip 'src/' from the handler path
  // This happens if the project uses 'src' as the root for handlers (common in Forge)
  // We check if 'src/index.ts' exists but 'index.ts' does not, AND if there is a handler 'index.handler'
  // Or simply, if the user created the file in 'src/' but 'src/' path is redundant for handlers.

  // Heuristic: Check existing function handlers
  let srcIsRoot = false;
  try {
    if (functions && functions.items && functions.items.length > 0) {
      for (const f of functions.items) {
        const fJson = f.toJSON();
        if (fJson && fJson.handler) {
          const h = fJson.handler.split(".")[0]; // e.g. "index" or "consumers/ingestion-consumer"
          const possibleSrcPath = path.join(projectRoot, "src", h + ".ts"); // simple check for .ts
          const possibleRootPath = path.join(projectRoot, h + ".ts");

          if (
            fs.existsSync(possibleSrcPath) &&
            !fs.existsSync(possibleRootPath)
          ) {
            srcIsRoot = true;
            break;
          }
        }
      }
    } else {
      // Fallback: if index.ts is in src but not root
      if (
        fs.existsSync(path.join(projectRoot, "src", "index.ts")) &&
        !fs.existsSync(path.join(projectRoot, "index.ts"))
      ) {
        srcIsRoot = true;
      }
    }
  } catch {
    // ignore
  }

  if (srcIsRoot && handlerPath.startsWith("src/")) {
    handlerPath = handlerPath.substring(4); // remove "src/"
  }

  const handlerName = `${handlerPath}.executeSql`;

  let functionExists = functions.items.find((f) => {
    const js = f.toJSON();
    return js && js.key === functionKey;
  });

  if (!functionExists) {
    functions.add(
      doc.createNode({
        key: functionKey,
        handler: handlerName,
      }),
    );
  } else {
    if (YAML.isMap(functionExists)) {
      functionExists.set("handler", handlerName);
    } else {
      const idx = functions.items.indexOf(functionExists);
      functions.set(
        idx,
        doc.createNode({ key: functionKey, handler: handlerName }),
      );
    }
  }

  const webtriggerKey = "execute-sql";
  if (!modules.has("webtrigger")) {
    modules.set("webtrigger", doc.createNode([]));
  }

  let webtriggers = modules.get("webtrigger");
  if (!YAML.isSeq(webtriggers)) {
    const obj = webtriggers.toJSON();
    webtriggers = doc.createNode(
      Object.entries(obj).map(([key, val]) => ({ key, ...val })),
    );
    modules.set("webtrigger", webtriggers);
  }

  let webtriggerExists = webtriggers.items.find((w) => {
    const js = w.toJSON();
    return js && js.key === webtriggerKey;
  });

  if (!webtriggerExists) {
    webtriggers.add(
      doc.createNode({
        key: webtriggerKey,
        function: functionKey,
      }),
    );
  } else {
    if (YAML.isMap(webtriggerExists)) {
      webtriggerExists.set("function", functionKey);
    } else {
      const idx = webtriggers.items.indexOf(webtriggerExists);
      webtriggers.set(
        idx,
        doc.createNode({ key: webtriggerKey, function: functionKey }),
      );
    }
  }

  try {
    fs.writeFileSync(manifestPath, doc.toString());
    spinner.succeed("Updated manifest file");
  } catch (e) {
    spinner.fail("Error writing manifest");
    console.error(e);
    process.exit(1);
  }

  // 4. Prompt for deployment
  console.log(); // Add newline for better UX
  const deployResponse = await prompts({
    type: "text",
    name: "cmd",
    message:
      "Command to deploy your app (required before creating webtrigger):",
    initial: "forge deploy",
  });

  if (!deployResponse.cmd) {
    console.log(chalk.yellow("Deployment cancelled."));
    process.exit(0);
  }

  const deployCmd = deployResponse.cmd;

  console.log(chalk.bold.blue(`\nRunning ${deployCmd}...\n`));

  await new Promise((resolve) => {
    const child = spawn(deployCmd, {
      stdio: "inherit",
      shell: true,
    });

    child.on("close", (code) => {
      if (code !== 0) {
        console.error(chalk.red(`\nDeploy failed with exit code ${code}.`));
        process.exit(code);
      }
      resolve();
    });
  });

  // 5. Run forge webtrigger create
  let webtriggerArgs = ["webtrigger", "create", "--functionKey", "execute-sql"];

  // Try to detect existing installation
  try {
    const listProc = spawn("forge", ["install", "list", "--json"], {
      shell: true,
    });
    let listOutput = "";
    await new Promise((resolve) => {
      listProc.stdout.on("data", (d) => (listOutput += d.toString()));
      listProc.on("close", resolve);
    });

    // Attempt to extract JSON
    const jsonStart = listOutput.indexOf("[");
    const jsonEnd = listOutput.lastIndexOf("]");
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const installations = JSON.parse(
        listOutput.substring(jsonStart, jsonEnd + 1),
      );
      const devInst = installations.find(
        (i) => i.environment === "development",
      );

      if (devInst) {
        console.log();
        const useInst = await prompts({
          type: "confirm",
          name: "value",
          message: `Found existing installation for ${chalk.cyan(devInst.product)} at ${chalk.cyan(devInst.site)}. Use this?`,
          initial: true,
        });

        if (useInst.value) {
          webtriggerArgs.push("--site", devInst.site);
          webtriggerArgs.push("--product", devInst.product);
        }
      }
    }
  } catch {
    // Ignore errors in auto-detection
  }

  console.log(
    chalk.bold.blue(
      "\nCreating webtrigger... (Please follow prompts if asked)\n",
    ),
  );

  const separator = chalk.gray(
    "==================================================",
  );
  console.log(separator);

  const forgeCmd = spawn("forge", webtriggerArgs, {
    stdio: ["inherit", "pipe", "inherit"],
    shell: true,
  });

  let stdoutData = "";

  forgeCmd.stdout.on("data", (data) => {
    process.stdout.write(data);
    stdoutData += data.toString();
  });

  forgeCmd.on("close", (code) => {
    console.log(separator);

    if (code !== 0) {
      console.log(
        chalk.yellow(
          `\nForge command exited with code ${code}. If you cancelled or it failed, you may need to run it manually.`,
        ),
      );
    }

    // Capture URL
    const urlRegex =
      /https:\/\/[a-zA-Z0-9-.]+\.atlassian-dev\.net\/[a-zA-Z0-9/-]+/;
    const matches = stdoutData.match(urlRegex);

    if (matches) {
      const url = matches[0];
      console.log(chalk.green(`\nFound Webtrigger URL: ${url}`));
      updateEnv(url);
    } else {
      console.log(
        chalk.yellow(
          "\nCould not automatically find Webtrigger URL in output.",
        ),
      );
      console.log(
        "If created, please add the URL to your .env file as FORGE_SQL_WEBTRIGGER=<url>",
      );
      finish();
    }
  });
}

function updateEnv(url) {
  console.log();
  const spinner = ora("Updating .env file...").start();
  const envPath = path.join(projectRoot, ".env");
  const envVar = `FORGE_SQL_WEBTRIGGER=${url}`;

  let envContent = "";
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf8");
    if (!envContent.endsWith("\n") && envContent.length > 0) {
      envContent += "\n";
    }
  }

  // Check if already exists
  if (envContent.includes("FORGE_SQL_WEBTRIGGER=")) {
    envContent = envContent.replace(
      /FORGE_SQL_WEBTRIGGER=.*(\n|$)/,
      `${envVar}\n`,
    );
  } else {
    envContent += `${envVar}\n`;
  }

  fs.writeFileSync(envPath, envContent);
  spinner.succeed("Updated .env with Webtrigger URL");
  finish();
}

function finish() {
  const msg = "  ✔  Setup completed successfully!     ";
  const line = "─".repeat(msg.length + 1);
  console.log(chalk.bold.green(`\n┌${line}┐`));
  console.log(chalk.bold.green(`│${msg}│`));
  console.log(chalk.bold.green(`└${line}┘\n`));
  console.log(`Run ${chalk.cyan("'fsql'")} to start.\n`);
}

main().catch((err) => {
  console.error(chalk.red("Unexpected error:"), err);
  process.exit(1);
});
