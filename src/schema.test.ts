import { describe, it, expect, vi } from "vitest";
import { loadSchema, getSchemaCache } from "./schema.js";
import type { SqlResult } from "./client.js";

describe("schema", () => {
  describe("loadSchema", () => {
    it("handles lowercase column names from information_schema", async () => {
      const mockClient = {
        execute: vi.fn().mockResolvedValue({
          rows: [
            { table_name: "users", column_name: "id" },
            { table_name: "users", column_name: "name" },
            { table_name: "posts", column_name: "id" },
          ],
        } as SqlResult),
      };

      const timeMs = await loadSchema(mockClient as any);

      expect(timeMs).toBeGreaterThanOrEqual(0);

      const cache = getSchemaCache();
      expect(cache.tables).toContain("users");
      expect(cache.tables).toContain("posts");
      expect(cache.columns.get("users")).toEqual(["id", "name"]);
      expect(cache.columns.get("posts")).toEqual(["id"]);
    });

    it("handles uppercase column names from different drivers", async () => {
      const mockClient = {
        execute: vi.fn().mockResolvedValue({
          rows: [
            { TABLE_NAME: "users", COLUMN_NAME: "ID" },
            { TABLE_NAME: "users", COLUMN_NAME: "EMAIL" },
            { TABLE_NAME: "posts", COLUMN_NAME: "TITLE" },
          ],
        } as SqlResult),
      };

      const timeMs = await loadSchema(mockClient as any);
      expect(timeMs).toBeGreaterThanOrEqual(0);

      const cache = getSchemaCache();
      expect(cache.tables).toContain("users");
      expect(cache.tables).toContain("posts");
      expect(cache.columns.get("users")).toEqual(["ID", "EMAIL"]);
      expect(cache.columns.get("posts")).toEqual(["TITLE"]);
    });

    it("populates allColumns with unique column names", async () => {
      const mockClient = {
        execute: vi.fn().mockResolvedValue({
          rows: [
            { table_name: "users", column_name: "id" },
            { table_name: "posts", column_name: "id" },
            { table_name: "posts", column_name: "title" },
          ],
        } as SqlResult),
      };

      await loadSchema(mockClient as any);

      const cache = getSchemaCache();
      expect(cache.allColumns).toContain("id");
      expect(cache.allColumns).toContain("title");
      // id should only appear once despite being in two tables
      expect(cache.allColumns.filter((c) => c === "id").length).toBe(1);
    });

    it("handles empty result set", async () => {
      const mockClient = {
        execute: vi.fn().mockResolvedValue({
          rows: [],
        } as SqlResult),
      };

      await loadSchema(mockClient as any);

      const cache = getSchemaCache();
      expect(cache.tables).toEqual([]);
      expect(cache.columns.size).toBe(0);
      expect(cache.allColumns).toEqual([]);
    });

    it("skips rows with missing table_name or column_name", async () => {
      const mockClient = {
        execute: vi.fn().mockResolvedValue({
          rows: [
            { table_name: "users", column_name: "id" },
            { table_name: "users", column_name: null },
            { table_name: null, column_name: "orphan" },
            { table_name: "posts", column_name: "title" },
          ],
        } as SqlResult),
      };

      await loadSchema(mockClient as any);

      const cache = getSchemaCache();
      expect(cache.columns.get("users")).toEqual(["id"]);
      expect(cache.tables).toContain("posts");
      expect(cache.allColumns).not.toContain(null);
    });

    it("returns elapsed time in milliseconds", async () => {
      const mockClient = {
        execute: vi.fn().mockResolvedValue({
          rows: [{ table_name: "users", column_name: "id" }],
        } as SqlResult),
      };

      const startTime = Date.now();
      const timeMs = await loadSchema(mockClient as any);
      const elapsed = Date.now() - startTime;

      expect(timeMs).toBeGreaterThanOrEqual(0);
      expect(timeMs).toBeLessThanOrEqual(elapsed + 10); // small margin for test overhead
    });
  });

  describe("getSchemaCache", () => {
    it("returns the current schema cache", async () => {
      const mockClient = {
        execute: vi.fn().mockResolvedValue({
          rows: [{ table_name: "test", column_name: "col" }],
        } as SqlResult),
      };

      await loadSchema(mockClient as any);

      const cache = getSchemaCache();
      expect(cache.tables).toContain("test");
      expect(cache.columns.get("test")).toEqual(["col"]);
    });
  });
});
