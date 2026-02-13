import { describe, it, expect } from "vitest";
import { ResultFormatter } from "./formatter.js";

describe("ResultFormatter", () => {
  describe("formatValue", () => {
    it("formats null as 'NULL'", () => {
      const result = ResultFormatter.formatValue(null);
      expect(result).toContain("NULL");
    });

    it("formats undefined as 'NULL'", () => {
      const result = ResultFormatter.formatValue(undefined);
      expect(result).toContain("NULL");
    });

    it("formats true as a truthy string", () => {
      const result = ResultFormatter.formatValue(true);
      expect(result).toContain("true");
    });

    it("formats false as a falsy string", () => {
      const result = ResultFormatter.formatValue(false);
      expect(result).toContain("false");
    });

    it("formats numbers as strings", () => {
      expect(ResultFormatter.formatValue(42)).toContain("42");
      expect(ResultFormatter.formatValue(3.14)).toContain("3.14");
      expect(ResultFormatter.formatValue(0)).toContain("0");
    });

    it("formats strings as-is", () => {
      expect(ResultFormatter.formatValue("hello")).toBe("hello");
    });
  });

  describe("formatResult", () => {
    it("formats error result with error message", () => {
      const result = ResultFormatter.formatResult({
        error: "Connection failed",
      });
      expect(result).toContain("Connection failed");
      expect(result).toContain("Error");
    });

    it("formats result with rows as table", () => {
      const result = ResultFormatter.formatResult({
        rows: [
          { id: 1, name: "Alice" },
          { id: 2, name: "Bob" },
        ],
      });
      expect(result).toContain("Alice");
      expect(result).toContain("Bob");
      expect(result).toContain("(2 rows)");
    });

    it("uses singular 'row' for single row result", () => {
      const result = ResultFormatter.formatResult({
        rows: [{ id: 1 }],
      });
      expect(result).toContain("(1 row)");
      expect(result).not.toContain("(1 rows)");
    });

    it("uses plural 'rows' for multiple results", () => {
      const result = ResultFormatter.formatResult({
        rows: [{ id: 1 }, { id: 2 }, { id: 3 }],
      });
      expect(result).toContain("(3 rows)");
    });

    it("formats zero rows result", () => {
      const result = ResultFormatter.formatResult({
        rows: [],
      });
      expect(result).toContain("(0 rows)");
    });

    it("formats affected rows for non-SELECT queries", () => {
      const result = ResultFormatter.formatResult({
        affectedRows: 5,
      });
      expect(result).toContain("5");
      expect(result).toContain("affected");
    });

    it("uses singular 'row' for single affected row", () => {
      const result = ResultFormatter.formatResult({
        affectedRows: 1,
      });
      expect(result).toContain("1 row affected");
      expect(result).not.toContain("1 rows");
    });

    it("formats successful query with no rows or affected rows", () => {
      const result = ResultFormatter.formatResult({});
      expect(result).toContain("executed successfully");
    });

    it("prioritizes error over rows", () => {
      const result = ResultFormatter.formatResult({
        error: "Parse error",
        rows: [{ name: "Alice" }],
      });
      expect(result).toContain("Parse error");
      expect(result).not.toContain("Alice");
    });
  });

  describe("formatError", () => {
    it("formats error message with Error label", () => {
      const result = ResultFormatter.formatError("Connection timeout");
      expect(result).toContain("Error");
      expect(result).toContain("Connection timeout");
    });
  });

  describe("formatSuccess", () => {
    it("formats success message with checkmark", () => {
      const result = ResultFormatter.formatSuccess("Operation complete");
      expect(result).toContain("Operation complete");
    });
  });

  describe("formatQueryTime", () => {
    it("formats milliseconds as seconds with 3 decimals", () => {
      const result = ResultFormatter.formatQueryTime(1500);
      expect(result).toContain("1.500");
    });

    it("formats small query times correctly", () => {
      const result = ResultFormatter.formatQueryTime(42);
      expect(result).toContain("0.042");
    });

    it("formats large query times correctly", () => {
      const result = ResultFormatter.formatQueryTime(5000);
      expect(result).toContain("5.000");
    });
  });
});
