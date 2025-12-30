import fs from "fs";
import path from "path";
import ts from "typescript";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, "..");
const srcPath = path.join(projectRoot, "src", "execute-sql.ts");
const templatesDir = path.join(projectRoot, "templates");

// Ensure templates directory exists
if (!fs.existsSync(templatesDir)) {
  fs.mkdirSync(templatesDir, { recursive: true });
}

const sourceCode = fs.readFileSync(srcPath, "utf8");

function compile(code: string, options: ts.CompilerOptions): string {
  const result = ts.transpileModule(code, {
    compilerOptions: options,
  });
  return result.outputText;
}

console.log("🏗️  Building templates from src/execute-sql.ts...");

// 1. Copy exact TS file
fs.writeFileSync(path.join(templatesDir, "execute-sql.ts"), sourceCode);
console.log("  ✅ execute-sql.ts (Copy)");

// 2. Generate ESM (.js)
// We want modern syntax but no types. 'esnext' preserves import/export.
const esmOutput = compile(sourceCode, {
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
  removeComments: false, // Keep comments for the user's benefit
});

fs.writeFileSync(path.join(templatesDir, "execute-sql.js"), esmOutput);
console.log("  ✅ execute-sql.js (ESM)");

// 3. Generate CommonJS (.cjs)
// This transforms import -> require
const cjsOutput = compile(sourceCode, {
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.CommonJS,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
  esModuleInterop: true,
  removeComments: false,
});

fs.writeFileSync(path.join(templatesDir, "execute-sql.cjs"), cjsOutput);
console.log("  ✅ execute-sql.cjs (CommonJS)");

console.log("🎉 Templates updated successfully!");
