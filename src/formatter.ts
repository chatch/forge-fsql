import chalk from "chalk";
import Table from "cli-table3";
import { SqlResult } from "./client.js";

export class ResultFormatter {
  static formatTable(rows: any[]): string {
    if (!rows || rows.length === 0) {
      return chalk.yellow("(0 rows)");
    }

    const headers = Object.keys(rows[0]);
    const table = new Table({
      head: headers.map((h) => chalk.cyan(h)),
      style: {
        head: [],
        border: ["grey"],
      },
    });

    rows.forEach((row) => {
      table.push(headers.map((h) => this.formatValue(row[h])));
    });

    return (
      table.toString() +
      "\n" +
      chalk.gray(`(${rows.length} row${rows.length !== 1 ? "s" : ""})`)
    );
  }

  static formatValue(value: any): string {
    if (value === null || value === undefined) {
      return chalk.gray("NULL");
    }
    if (typeof value === "boolean") {
      return value ? chalk.green("true") : chalk.red("false");
    }
    if (typeof value === "number") {
      return chalk.yellow(value.toString());
    }
    return value.toString();
  }

  static formatError(error: string): string {
    return chalk.red("✗ Error: ") + error;
  }

  static formatSuccess(message: string): string {
    return chalk.green("✓ ") + message;
  }

  static formatResult(result: SqlResult): string {
    if (result.error) {
      return this.formatError(result.error);
    }

    if (result.rows) {
      return this.formatTable(result.rows);
    }

    if (result.affectedRows !== undefined) {
      const rowWord = result.affectedRows === 1 ? "row" : "rows";
      return this.formatSuccess(`${result.affectedRows} ${rowWord} affected`);
    }

    return chalk.gray("Query executed successfully");
  }

  static formatQueryTime(ms: number): string {
    const seconds = (ms / 1000).toFixed(3);
    return chalk.gray(`⏱  ${seconds}s`);
  }
}
