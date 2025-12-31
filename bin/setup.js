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

  const { isEsm, isTypeScript } = checkDependencies();
  const manifestPath = getManifestPath();

  const fsqlRelPath = await createExecutionFunction(isTypeScript, isEsm);
  if (!fsqlRelPath) return;

  updateManifestFile(manifestPath, fsqlRelPath);

  const deployed = await deployForgeApp();
  if (!deployed) return;

  const url = await setupWebTrigger();
  if (url) {
    updateEnv(url);
  }

  finish();
}

function checkDependencies() {
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
  return { isEsm, isTypeScript };
}

function getManifestPath() {
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
  return manifestPath;
}

async function createExecutionFunction(isTypeScript, isEsm) {
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
    return null;
  }

  const fsqlRelPath = response.fsqlPath;
  const fsqlAbsPath = path.resolve(projectRoot, fsqlRelPath);
  const srcSameDir = path.dirname(fsqlAbsPath);

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

  return fsqlRelPath;
}

function updateManifestFile(manifestPath, fsqlRelPath) {
  const spinner = ora("Updating manifest.yml...").start();

  try {
    const doc = readManifest(manifestPath);
    ensureModulesStructure(doc);

    const modules = doc.get("modules");

    // 1. Determine the handler name (e.g. index.executeSql)
    const handlerName = resolveHandlerName(doc, fsqlRelPath);

    // 2. Add or update the function definition
    const functionKey = "executeSql";
    upsertFunction(doc, modules, functionKey, handlerName);

    // 3. Add or update the webtrigger definition
    const webtriggerKey = "execute-sql";
    upsertWebTrigger(doc, modules, webtriggerKey, functionKey);

    // 4. Save
    writeManifest(manifestPath, doc);
    spinner.succeed("Updated manifest file");
  } catch (e) {
    spinner.fail("Error updating manifest");
    console.error(e);
    process.exit(1);
  }
}

function readManifest(manifestPath) {
  try {
    const fileContents = fs.readFileSync(manifestPath, "utf8");
    return YAML.parseDocument(fileContents);
  } catch (e) {
    throw new Error(`Error reading manifest: ${e.message}`);
  }
}

function ensureModulesStructure(doc) {
  if (!doc.contents) {
    doc.contents = doc.createNode({});
  }
  if (!doc.has("modules")) {
    doc.set("modules", doc.createNode({}));
  }
}

function resolveHandlerName(doc, fsqlRelPath) {
  let handlerPath = fsqlRelPath.replace(/\.(ts|js|cjs|mjs)$/, "");
  handlerPath = handlerPath.split(path.sep).join("/");

  const modules = doc.get("modules");
  let functions = modules.get("function"); // might be null/undefined

  // Logic to detect if we should strip 'src/' from the handler path
  let srcIsRoot = false;

  // normalize functions list to check existing handlers
  let items = [];
  if (functions && YAML.isSeq(functions)) {
    items = functions.items;
  }

  try {
    if (items.length > 0) {
      for (const f of items) {
        const fJson = f.toJSON();
        if (fJson && fJson.handler) {
          const h = fJson.handler.split(".")[0];
          const possibleSrcPath = path.join(projectRoot, "src", h + ".ts");
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
    handlerPath = handlerPath.substring(4);
  }

  return `${handlerPath}.executeSql`;
}

function upsertFunction(doc, modules, key, handlerName) {
  if (!modules.has("function")) {
    modules.set("function", doc.createNode([]));
  }

  let functions = modules.get("function");

  // Fix if it's not a sequence (e.g. some malformed yaml or object)
  if (!YAML.isSeq(functions)) {
    const obj = functions.toJSON();
    functions = doc.createNode(
      Object.entries(obj).map(([k, v]) => ({ key: k, ...v })),
    );
    modules.set("function", functions);
  }

  let functionExists = functions.items.find((f) => {
    const js = f.toJSON();
    return js && js.key === key;
  });

  if (!functionExists) {
    functions.add(
      doc.createNode({
        key: key,
        handler: handlerName,
      }),
    );
  } else {
    if (YAML.isMap(functionExists)) {
      functionExists.set("handler", handlerName);
    } else {
      const idx = functions.items.indexOf(functionExists);
      functions.set(idx, doc.createNode({ key: key, handler: handlerName }));
    }
  }
}

function upsertWebTrigger(doc, modules, triggerKey, functionKey) {
  if (!modules.has("webtrigger")) {
    modules.set("webtrigger", doc.createNode([]));
  }

  let webtriggers = modules.get("webtrigger");

  if (!YAML.isSeq(webtriggers)) {
    const obj = webtriggers.toJSON();
    webtriggers = doc.createNode(
      Object.entries(obj).map(([k, v]) => ({ key: k, ...v })),
    );
    modules.set("webtrigger", webtriggers);
  }

  let webtriggerExists = webtriggers.items.find((w) => {
    const js = w.toJSON();
    return js && js.key === triggerKey;
  });

  if (!webtriggerExists) {
    webtriggers.add(
      doc.createNode({
        key: triggerKey,
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
        doc.createNode({ key: triggerKey, function: functionKey }),
      );
    }
  }
}

function writeManifest(manifestPath, doc) {
  fs.writeFileSync(manifestPath, doc.toString());
}

async function deployForgeApp() {
  console.log();
  const deployResponse = await prompts({
    type: "text",
    name: "cmd",
    message:
      "Command to deploy your app (required before creating webtrigger):",
    initial: "forge deploy",
  });

  if (!deployResponse.cmd) {
    console.log(chalk.yellow("Deployment cancelled."));
    return false;
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
  return true;
}

async function setupWebTrigger() {
  let webtriggerArgs = ["webtrigger", "create", "--functionKey", "execute-sql"];

  try {
    const listProc = spawn("forge", ["install", "list", "--json"], {
      shell: true,
    });
    let listOutput = "";
    await new Promise((resolve) => {
      listProc.stdout.on("data", (d) => (listOutput += d.toString()));
      listProc.on("close", resolve);
    });

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
    // Ignore
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

  return new Promise((resolve) => {
    const forgeCmd = spawn("forge", webtriggerArgs, {
      stdio: [
        "inherit", // stdin
        "pipe", // stdout
        "pipe", // stderr
      ],
      shell: true,
    });

    let outputData = "";

    const onData = (data, stream) => {
      stream.write(data);
      outputData += data.toString();
    };

    forgeCmd.stdout.on("data", (d) => onData(d, process.stdout));
    forgeCmd.stderr.on("data", (d) => onData(d, process.stderr));

    forgeCmd.on("close", (code) => {
      console.log(separator);

      const urlRegex =
        /https:\/\/[a-zA-Z0-9-.]+\.atlassian(-dev)?\.net\/[a-zA-Z0-9/_.~%-]+/;
      const matches = outputData.match(urlRegex);

      if (matches) {
        const url = matches[0];
        console.log(chalk.green(`\nFound Webtrigger URL: ${url}`));
        resolve(url);
        return;
      }

      if (code !== 0) {
        console.error(
          chalk.red(`\n❌ Error: Forge command failed with exit code ${code}.`),
        );
        process.exit(code);
      }

      console.log(
        chalk.yellow(
          "\nCould not automatically find Webtrigger URL in output.",
        ),
      );
      console.log(
        "If created, please add the URL to your .env file as FORGE_SQL_WEBTRIGGER=<url>",
      );
      resolve(null);
    });
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

  const declRegex = /^FORGE_SQL_WEBTRIGGER=.*$/m;
  if (declRegex.test(envContent)) {
    envContent = envContent.replace(declRegex, envVar);
  } else {
    envContent += `${envVar}\n`;
  }

  fs.writeFileSync(envPath, envContent);
  spinner.succeed("Updated .env with Webtrigger URL");
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
