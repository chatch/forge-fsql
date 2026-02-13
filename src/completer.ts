import { specialCommands } from "./commands.js";
import { getSchemaCache } from "./schema.js";

/**
 * Create a completer function for readline.
 * Returns [completions, substring being completed]
 */
export function completer(line: string): [string[], string] {
  const trimmed = line.trimStart();

  // 1. Dot commands completion
  if (trimmed.startsWith(".")) {
    const matches = specialCommands
      .filter((c) => c.name.toLowerCase().startsWith(trimmed.toLowerCase()))
      .map((c) => c.name);
    return [matches, trimmed];
  }

  // 2. Extract the word being typed (last word after spaces)
  const words = trimmed.split(/\s+/);
  const lastWord = words[words.length - 1] || "";

  // Nothing to complete on empty input
  if (!lastWord) {
    return [[], ""];
  }

  const schemaCache = getSchemaCache();

  // 3. Check if completing after table. (e.g., "users.")
  if (lastWord.includes(".")) {
    const dotIndex = lastWord.lastIndexOf(".");
    const tablePart = lastWord.substring(0, dotIndex);
    const columnPart = lastWord.substring(dotIndex + 1);

    // Look for table (case-insensitive)
    const tableKey = Array.from(schemaCache.columns.keys()).find(
      (t) => t.toLowerCase() === tablePart.toLowerCase(),
    );

    if (tableKey) {
      const tableColumns = schemaCache.columns.get(tableKey)!;
      const matches = tableColumns
        .filter((c) => c.toLowerCase().startsWith(columnPart.toLowerCase()))
        .map((c) => `${tablePart}.${c}`);
      return [matches, lastWord];
    }
  }

  // 4. Context-aware completion based on previous keyword
  const prevWord =
    words.length > 1 ? words[words.length - 2].toUpperCase() : "";

  if (["FROM", "JOIN", "INTO", "UPDATE", "TABLE"].includes(prevWord)) {
    // After FROM, JOIN, etc. -> complete with table names
    const matches = schemaCache.tables.filter((t) =>
      t.toLowerCase().startsWith(lastWord.toLowerCase()),
    );
    return [matches, lastWord];
  }

  // 5. Default: complete with both tables and columns
  const allCompletions = [
    ...schemaCache.tables,
    ...schemaCache.allColumns,
  ].filter((c) => c.toLowerCase().startsWith(lastWord.toLowerCase()));

  // Remove duplicates (in case a table and column share a name)
  const uniqueCompletions = [...new Set(allCompletions)];

  return [uniqueCompletions, lastWord];
}
