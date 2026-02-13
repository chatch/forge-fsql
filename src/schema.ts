import { ForgeClient } from "./client.js";

export interface SchemaCache {
  tables: string[];
  columns: Map<string, string[]>; // table_name -> column_names
  allColumns: string[]; // all unique column names for unqualified completion
}

let schemaCache: SchemaCache = {
  tables: [],
  columns: new Map(),
  allColumns: [],
};

/**
 * Load the database schema (tables and columns) into the cache.
 * Returns the time taken in milliseconds.
 */
export async function loadSchema(client: ForgeClient): Promise<number> {
  const startTime = Date.now();

  const result = await client.execute(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
    ORDER BY table_name, ordinal_position
  `);

  const cache: SchemaCache = {
    tables: [],
    columns: new Map(),
    allColumns: [],
  };

  if (result.rows) {
    const tableSet = new Set<string>();
    const columnSet = new Set<string>();

    for (const row of result.rows) {
      // Handle both lowercase and uppercase column names from different drivers
      const tableName = row.table_name || row.TABLE_NAME;
      const columnName = row.column_name || row.COLUMN_NAME;

      if (!tableName || !columnName) continue;

      tableSet.add(tableName);
      columnSet.add(columnName);

      if (!cache.columns.has(tableName)) {
        cache.columns.set(tableName, []);
      }
      cache.columns.get(tableName)!.push(columnName);
    }

    cache.tables = Array.from(tableSet);
    cache.allColumns = Array.from(columnSet);
  }

  schemaCache = cache;
  return Date.now() - startTime;
}

/**
 * Get the current schema cache.
 */
export function getSchemaCache(): SchemaCache {
  return schemaCache;
}
