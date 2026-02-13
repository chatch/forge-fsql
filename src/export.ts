import chalk from "chalk";
import * as dotenv from "dotenv";
import * as readline from "readline";
import fs from "fs";
import path from "path";
import { readFileSync } from "fs";
import { ForgeClient } from "./client.js";

dotenv.config();

// Parse CLI arguments
const args = process.argv.slice(2);

// Check for help/version flags early
if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Forge FSQL Export - Export schema and data from Atlassian Forge SQL

Usage:
  fsql-export [options]

Options:
  --version, -V        Show version
  --help, -h           Show this help
  --url <url>          Webtrigger URL (overrides FORGE_SQL_WEBTRIGGER)
  --schema-only        Export schema only (skip data)
  --output <file>      Output file path (default: ./fsql-dumps/fsql-export-<timestamp>.sql)
  --migrations <path>  Path to migration.ts for DDL extraction
  --live-schema        Skip migrations, fetch all DDL from the live database

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

// Parse options
interface ExportOptions {
  schemaOnly: boolean;
  liveSchema: boolean;
  url?: string;
  output?: string;
  migrations?: string;
}

// Parse CLI flags into structured export options
function parseExportArgs(): ExportOptions {
  const options: ExportOptions = {
    schemaOnly: args.includes("--schema-only"),
    liveSchema: args.includes("--live-schema"),
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--url" && args[i + 1]) {
      options.url = args[i + 1];
      i++;
    } else if (args[i] === "--output" && args[i + 1]) {
      options.output = args[i + 1];
      i++;
    } else if (args[i] === "--migrations" && args[i + 1]) {
      options.migrations = args[i + 1];
      i++;
    }
  }

  return options;
}

const options = parseExportArgs();
const url = options.url || process.env.FORGE_SQL_WEBTRIGGER;

if (!url) {
  console.error(chalk.red("Error: FORGE_SQL_WEBTRIGGER not configured"));
  console.error(
    "Try rerunning 'fsql-setup'.\n\nSee the Installation docs at https://github.com/chatch/forge-fsql?tab=readme-ov-file#installation",
  );
  process.exit(1);
}

const client = new ForgeClient({ url });

// Collect SQL output lines
const outputLines: string[] = [];

// Append a line to the SQL output buffer
function emit(line: string = ""): void {
  outputLines.push(line);
}

// Escape a value for safe inclusion in a SQL INSERT statement
function escapeSqlValue(val: unknown): string | number {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return val;
  if (typeof val === "boolean") return val ? 1 : 0;
  if (typeof val === "object") {
    return `'${JSON.stringify(val).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
  }
  return `'${String(val).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

// --- Interactive prompts (stderr so they don't mix with SQL output) ---

// Prompt the user for text input via stderr
function askQuestion(message: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Prompt the user for a yes/no confirmation (defaults to yes)
async function confirm(message: string): Promise<boolean> {
  const answer = await askQuestion(`${message} (Y/n) `);
  return answer.toLowerCase() !== "n";
}

// --- Migration file discovery and DDL extraction ---

interface DDLStats {
  tables: Record<string, string>;
  views: Record<string, string>;
}

// Recursively search the working directory for migration.ts/js files
function findMigrationCandidates(): string[] {
  const results: string[] = [];
  const skipDirs = new Set([
    "node_modules",
    "dist",
    ".git",
    ".next",
    "build",
    "coverage",
  ]);

  function walk(dir: string): void {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) {
          walk(path.join(dir, entry.name));
        }
      } else if (
        entry.name === "migration.ts" ||
        entry.name === "migration.js"
      ) {
        results.push(path.join(dir, entry.name));
      }
    }
  }

  walk(process.cwd());
  return results.map((p) => path.relative(process.cwd(), p));
}

// Parse CREATE TABLE/VIEW statements from a migration file
function extractDDLFromMigrations(filePath: string): DDLStats {
  const content = fs.readFileSync(filePath, "utf8");

  const tables: Record<string, string> = {};
  const views: Record<string, string> = {};

  // Match CREATE TABLE statements
  const tableRegex =
    /export const (CREATE_\w+_TABLE) = `\s*(CREATE TABLE[^`]+)`/gs;
  let match: RegExpExecArray | null;
  while ((match = tableRegex.exec(content)) !== null) {
    const [, , sql] = match;
    const tableNameMatch = sql.match(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/i);
    if (tableNameMatch) {
      tables[tableNameMatch[1]] = sql.trim();
    }
  }

  // Match CREATE VIEW statements
  const viewRegex =
    /export const (CREATE_\w+_VIEW) = `\s*(CREATE (?:OR REPLACE )?VIEW[^`]+)`/gs;
  while ((match = viewRegex.exec(content)) !== null) {
    const [, , sql] = match;
    const viewNameMatch = sql.match(/CREATE (?:OR REPLACE )?VIEW (\w+)/i);
    if (viewNameMatch) {
      views[viewNameMatch[1]] = sql.trim();
    }
  }

  return { tables, views };
}

// Determine which migration file to use via CLI flag, auto-discovery, or user input
async function resolveMigrationFile(): Promise<string | null> {
  // If --migrations provided, use it directly
  if (options.migrations) {
    if (!fs.existsSync(options.migrations)) {
      console.log(`Error: Migration file not found: ${options.migrations}\n`);
      process.exit(1);
    }
    return options.migrations;
  }

  console.log(chalk.bold.blue("Forge FSQL Export"));
  console.log("");
  console.log(
    "Searching for migrations file to extract DDL [NOTE: use " +
      "--live-schema to skip this and use the database only; OR type " +
      "'n' below then Enter].\n",
  );

  // Auto-search
  const candidates = findMigrationCandidates();

  if (candidates.length === 1) {
    const use = await confirm(
      `Found migration file: ${candidates[0]}. Use this?`,
    );
    if (use) return candidates[0];
  } else if (candidates.length > 1) {
    console.log("Found multiple migration files:\n");
    candidates.forEach((c, i) => console.log(`  ${i + 1}) ${c}\n`));
    const choice = await askQuestion(
      "Enter number to use, or press Enter to skip: ",
    );
    const idx = parseInt(choice, 10) - 1;
    if (idx >= 0 && idx < candidates.length) {
      return candidates[idx];
    }
  }

  // Not found or user skipped — ask for a path
  const userPath = await askQuestion(
    "Enter path to migration.ts (or press Enter to skip): ",
  );
  if (userPath) {
    if (!fs.existsSync(userPath)) {
      console.log(`File not found: ${userPath}\n`);
      return null;
    }
    return userPath;
  }

  return null;
}

// DDL lookup populated from migration file (if found)
let DDL_FROM_MIGRATIONS: Record<string, string> = {};

interface TablesAndViews {
  tables: string[];
  views: string[];
}

// Fetch the list of tables and views from the remote database
async function getTablesAndViews(): Promise<TablesAndViews> {
  console.log("Fetching table list...\n");
  const result = await client.execute("SHOW FULL TABLES");

  if (result.error) {
    throw new Error(`Failed to get tables: ${result.error}`);
  }

  const tables: string[] = [];
  const views: string[] = [];

  for (const r of result.rows || []) {
    const tableNameKey = Object.keys(r).find((k) => k.startsWith("Tables_in_"));
    if (!tableNameKey) continue;
    const name = r[tableNameKey] as string;
    if (r["Table_type"] === "VIEW") {
      views.push(name);
    } else {
      tables.push(name);
    }
  }

  return { tables, views };
}

// Emit a DROP/CREATE TABLE statement from migrations or live schema
async function generateCreateTable(table: string): Promise<void> {
  emit(`\n-- Table structure for table \`${table}\``);
  emit(`DROP TABLE IF EXISTS \`${table}\`;`);

  // Use DDL from migration.ts if available
  const ddlFromMigration = DDL_FROM_MIGRATIONS[table];
  if (ddlFromMigration) {
    emit(`${ddlFromMigration};\n`);
    return;
  }

  // Fallback to SHOW CREATE TABLE
  console.log(
    `  DDL for ${table} not in migrations, using SHOW CREATE TABLE\n`,
  );
  const result = await client.execute(`SHOW CREATE TABLE ${table}`);

  if (result.error) {
    console.log(
      `Warning: SHOW CREATE TABLE failed for ${table}: ${result.error}\n`,
    );
    return;
  }

  if (!result.rows?.length) return;

  const createSql = (result.rows[0] as { "Create Table": string })[
    "Create Table"
  ];
  emit(`${createSql};\n`);
}

// Emit a DROP/CREATE VIEW statement from migrations or INFORMATION_SCHEMA
async function generateCreateView(view: string): Promise<void> {
  emit(`\n-- View structure for view \`${view}\``);
  emit(`DROP VIEW IF EXISTS \`${view}\`;`);

  // Use DDL from migration.ts if available
  const ddlFromMigration = DDL_FROM_MIGRATIONS[view];
  if (ddlFromMigration) {
    emit(`${ddlFromMigration};\n`);
    return;
  }

  // Fallback to INFORMATION_SCHEMA
  console.log(
    `  DDL for view ${view} not in migrations, using INFORMATION_SCHEMA\n`,
  );
  const result = await client.execute(
    `SELECT VIEW_DEFINITION FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_NAME = '${view}' AND TABLE_SCHEMA = DATABASE()`,
  );

  if (result.error) {
    console.log(
      `Warning: Error fetching view definition for ${view}: ${result.error}\n`,
    );
    return;
  }

  if (
    result.rows?.length &&
    (result.rows[0] as { VIEW_DEFINITION?: string }).VIEW_DEFINITION
  ) {
    let viewDef = (result.rows[0] as { VIEW_DEFINITION: string })
      .VIEW_DEFINITION;
    // Remove hardcoded schema names like `forge_xxxxx`.
    viewDef = viewDef.replace(/`forge_[a-f0-9]+`\./g, "");
    emit(`CREATE VIEW \`${view}\` AS ${viewDef};\n`);
  } else {
    console.log(`Warning: Could not get definition for view ${view}\n`);
  }
}

// Get non-generated column names for a table
async function getColumns(table: string): Promise<string[]> {
  const result = await client.execute(`SHOW COLUMNS FROM ${table}`);

  if (result.error) {
    throw new Error(`Failed to get columns for ${table}: ${result.error}`);
  }

  return (result.rows || [])
    .filter(
      (col: Record<string, unknown>) =>
        !(col.Extra as string)?.includes("GENERATED"),
    )
    .map((col: Record<string, unknown>) => col.Field as string);
}

// Fetch all rows and emit INSERT statements for a table
async function getData(table: string, validColumns: string[]): Promise<void> {
  console.log(`Fetching rows for ${table}...`);
  const result = await client.execute(`SELECT * FROM ${table}`);

  if (result.error) {
    console.log(`Warning: Error fetching data for ${table}: ${result.error}\n`);
    return;
  }

  const rows = result.rows || [];
  if (rows.length > 0) {
    emit(`-- Dumping data for table \`${table}\``);
    emit(`LOCK TABLES \`${table}\` WRITE;`);

    const colsList = validColumns.map((c) => `\`${c}\``).join(", ");
    emit(`INSERT INTO \`${table}\` (${colsList}) VALUES`);

    const valuesStr = rows
      .map((row: Record<string, unknown>) => {
        const rowValues = validColumns.map((col) => escapeSqlValue(row[col]));
        return `(${rowValues.join(", ")})`;
      })
      .join(",\n");

    emit(valuesStr + ";");
    emit(`UNLOCK TABLES;`);
  }
}

// Return the output file path from --output flag or a timestamped default
function getOutputPath(): string {
  if (options.output) {
    return options.output;
  }

  const dir = "./fsql-dumps";
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("Z", "");
  return path.join(dir, `fsql-export-${timestamp}.sql`);
}

// Orchestrate the full export: resolve DDL sources, dump schema and data, write output
async function main(): Promise<void> {
  // Resolve migration file for DDL extraction
  if (options.liveSchema) {
    console.log(
      "Live schema mode — all DDL will be fetched from the database\n",
    );
  } else {
    const migrationFile = await resolveMigrationFile();
    if (migrationFile) {
      console.log(chalk.green(`\nUsing migrations from: ${migrationFile}\n`));
      const ddlInfo = extractDDLFromMigrations(migrationFile);
      DDL_FROM_MIGRATIONS = { ...ddlInfo.tables, ...ddlInfo.views };
      const count =
        Object.keys(ddlInfo.tables).length + Object.keys(ddlInfo.views).length;
      console.log(
        `  Found ${Object.keys(ddlInfo.tables).length} table(s) and ${Object.keys(ddlInfo.views).length} view(s) in migrations\n`,
      );
      if (count === 0) {
        console.log("  Warning: No DDL statements found in migration file\n");
      }
    } else {
      console.log(
        "No migration file — all DDL will be fetched from the database\n",
      );
    }
  }

  console.log(`Using WebTrigger URL: ${url}\n`);
  if (options.schemaOnly) {
    console.log("Mode: Schema only (skipping data)\n");
  }

  emit("-- Export generated by fsql-export");
  if (options.schemaOnly) {
    emit("-- Schema only mode");
  }
  emit(`-- Generated at ${new Date().toISOString()}`);
  emit("SET FOREIGN_KEY_CHECKS=0;");
  emit('SET SQL_MODE="ANSI_QUOTES,NO_AUTO_VALUE_ON_ZERO";');
  emit('SET time_zone = "+00:00";');

  const { tables, views } = await getTablesAndViews();

  // Process tables first (to satisfy view dependencies), then views
  for (const table of tables) {
    console.log(`Processing table: ${table}...\n`);
    await generateCreateTable(table);

    if (!options.schemaOnly) {
      const validColumns = await getColumns(table);
      await getData(table, validColumns);
    }
  }

  for (const view of views) {
    console.log(`Processing view: ${view}...\n`);
    await generateCreateView(view);
  }

  emit("\nSET FOREIGN_KEY_CHECKS=1;");

  // Write to file
  const outputPath = getOutputPath();
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, outputLines.join("\n") + "\n");
  console.log(chalk.green(`\nExport written to ${outputPath}\n`));
  console.log("Done.");
}

main().catch((err) => {
  console.error(chalk.red(err.message || err));
  process.exit(1);
});
