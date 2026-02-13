import { describe, it, expect, vi } from "vitest";
import { completer } from "./completer.js";

// Mock the commands module to avoid circular dependency issues
vi.mock("./commands.js", () => ({
  specialCommands: [
    { name: ".help" },
    { name: ".schema" },
    { name: ".tables" },
    { name: ".refreshSchema" },
  ],
}));

// Mock the schema module to provide test data
vi.mock("./schema.js", () => ({
  getSchemaCache: () => ({
    tables: ["users", "posts", "comments"],
    columns: new Map([
      ["users", ["id", "name", "email"]],
      ["posts", ["id", "title", "user_id", "content"]],
      ["comments", ["id", "post_id", "user_id", "text"]],
    ]),
    allColumns: [
      "id",
      "name",
      "email",
      "title",
      "user_id",
      "content",
      "post_id",
      "text",
    ],
  }),
}));

describe("completer", () => {
  it("returns empty completions for empty input", () => {
    const [completions, substring] = completer("");
    expect(completions).toEqual([]);
    expect(substring).toBe("");
  });

  it("returns empty completions when only whitespace", () => {
    const [completions, substring] = completer("   ");
    expect(completions).toEqual([]);
    expect(substring).toBe("");
  });

  it("completes dot commands", () => {
    const [completions] = completer(".h");
    expect(completions).toContain(".help");
  });

  it("completes dot commands case-insensitively", () => {
    const [completions] = completer(".SCHE");
    expect(completions).toContain(".schema");
  });

  it("completes table names after FROM keyword", () => {
    const [completions] = completer("SELECT * FROM u");
    expect(completions).toContain("users");
    expect(completions).not.toContain("id");
  });

  it("completes table names after JOIN keyword", () => {
    const [completions] = completer("SELECT * FROM users JOIN p");
    expect(completions).toContain("posts");
  });

  it("completes table names after INTO keyword", () => {
    const [completions] = completer("INSERT INTO p");
    expect(completions).toContain("posts");
  });

  it("completes table names after UPDATE keyword", () => {
    const [completions] = completer("UPDATE u");
    expect(completions).toContain("users");
  });

  it("completes column names with table prefix", () => {
    const [completions, substring] = completer("SELECT users.");
    expect(completions).toContain("users.id");
    expect(completions).toContain("users.name");
    expect(completions).toContain("users.email");
    expect(substring).toBe("users.");
  });

  it("filters column names by prefix with table qualification", () => {
    const [completions] = completer("SELECT users.n");
    expect(completions).toContain("users.name");
    expect(completions).not.toContain("users.id");
  });

  it("completes qualified columns with case-insensitive table match", () => {
    const [completions] = completer("SELECT USERS.i");
    expect(completions).toContain("USERS.id");
  });

  it("returns empty for non-existent table prefix", () => {
    const [completions] = completer("SELECT nonexistent.");
    expect(completions).toEqual([]);
  });

  it("completes both tables and columns in default context", () => {
    const [completions] = completer("SELECT u");
    expect(completions).toContain("users");
    expect(completions).toContain("user_id");
  });

  it("filters default completions by prefix", () => {
    const [completions] = completer("SELECT id");
    expect(completions).toContain("id");
    expect(completions).not.toContain("users");
  });

  it("removes duplicate completions", () => {
    // "id" exists in allColumns and could match — verify no duplicates
    const [completions] = completer("SELECT i");
    const uniqueCount = new Set(completions).size;
    expect(completions.length).toBeGreaterThan(0);
    expect(uniqueCount).toBe(completions.length);
  });

  it("is case-insensitive for matching", () => {
    const [completions] = completer("SELECT US");
    expect(completions.some((c) => c.toLowerCase().includes("users"))).toBe(
      true,
    );
  });
});
