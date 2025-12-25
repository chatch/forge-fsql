import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export class History {
  private historyFile: string;
  private history: string[] = [];
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.historyFile = path.join(os.homedir(), ".forge_sql_history");
    this.maxSize = maxSize;
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.historyFile)) {
        const content = fs.readFileSync(this.historyFile, "utf-8");
        this.history = content.split("\n").filter(Boolean);
      }
    } catch (error) {
      console.error("Failed to load history:", error);
    }
  }

  save(): void {
    try {
      // Keep only last maxSize entries
      const toSave = this.history.slice(-this.maxSize);
      fs.writeFileSync(this.historyFile, toSave.join("\n"));
    } catch (error) {
      console.error("Failed to save history:", error);
    }
  }

  add(command: string): void {
    const trimmed = command.trim();
    if (trimmed && trimmed !== this.history[this.history.length - 1]) {
      this.history.push(trimmed);
    }
  }

  getAll(): string[] {
    return [...this.history];
  }
}
