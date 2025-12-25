#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const projectRoot = process.cwd();

console.log("Setting up Forge SQL CLI in this project...");

// 1. Create src/fsql.js
const srcDir = path.join(projectRoot, "src");
if (!fs.existsSync(srcDir)) {
  fs.mkdirSync(srcDir, { recursive: true });
}

const fsqlJsPath = path.join(srcDir, "fsql.js");
const fsqlJsContent = `import { executeSql } from 'forge-sql-cli';

export { executeSql };
`;

fs.writeFileSync(fsqlJsPath, fsqlJsContent);
console.log("✓ Created src/fsql.js");

// 2. Update manifest.yaml or manifest.yml
let manifestPath = path.join(projectRoot, "manifest.yml");
if (!fs.existsSync(manifestPath)) {
  manifestPath = path.join(projectRoot, "manifest.yaml");
}

if (!fs.existsSync(manifestPath)) {
  console.error(
    "Error: Could not find manifest.yml or manifest.yaml in the current directory.",
  );
  process.exit(1);
}

let manifest;
try {
  const fileContents = fs.readFileSync(manifestPath, "utf8");
  manifest = yaml.load(fileContents);
} catch (e) {
  console.error("Error reading manifest:", e);
  process.exit(1);
}

if (!manifest.modules) {
  manifest.modules = {};
}

// Ensure function is an array
const functionKey = "executeSql";
if (!manifest.modules.function) {
  manifest.modules.function = [];
} else if (!Array.isArray(manifest.modules.function)) {
  // Handle case where it might be a map (unlikely in Forge but just in case)
  manifest.modules.function = Object.entries(manifest.modules.function).map(
    ([key, val]) => ({ key, ...val }),
  );
}

const functionExists = manifest.modules.function.find(
  (f) => f.key === functionKey,
);
const handlerName = "fsql.executeSql";

if (!functionExists) {
  manifest.modules.function.push({
    key: functionKey,
    handler: handlerName,
  });
  console.log(
    `✓ Added function:${functionKey} with handler ${handlerName} to manifest`,
  );
} else {
  functionExists.handler = handlerName;
  console.log(
    `✓ Updated function:${functionKey} handler to ${handlerName} in manifest`,
  );
}

// Ensure webtrigger is an array
const webtriggerKey = "execute-sql";
if (!manifest.modules.webtrigger) {
  manifest.modules.webtrigger = [];
} else if (!Array.isArray(manifest.modules.webtrigger)) {
  manifest.modules.webtrigger = Object.entries(manifest.modules.webtrigger).map(
    ([key, val]) => ({ key, ...val }),
  );
}

const webtriggerExists = manifest.modules.webtrigger.find(
  (w) => w.key === webtriggerKey,
);
if (!webtriggerExists) {
  manifest.modules.webtrigger.push({
    key: webtriggerKey,
    function: functionKey,
  });
  console.log(`✓ Added webtrigger:${webtriggerKey} to manifest`);
} else {
  webtriggerExists.function = functionKey;
  console.log(
    `✓ Ensured webtrigger:${webtriggerKey} points to function ${functionKey}`,
  );
}

try {
  // Use a large enough lineWidth to prevent wrapping which can break Forge parsing sometimes
  const newYaml = yaml.dump(manifest, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
  });
  fs.writeFileSync(manifestPath, newYaml);
  console.log("✓ Updated manifest file successfully");
} catch (e) {
  console.error("Error writing manifest:", e);
  process.exit(1);
}

console.log("\nSetup completed successfully!");
console.log(
  "You can now use the forge-sql-cli to interact with your Forge SQL database.",
);
