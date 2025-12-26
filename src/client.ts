export interface SqlResult {
  rows?: any[];
  affectedRows?: number;
  error?: string;
  metadata?: Record<string, any>;
}

export interface ClientConfig {
  url: string;
  timeout?: number;
}

export class ForgeClient {
  private config: ClientConfig;

  constructor(config: ClientConfig) {
    this.config = {
      timeout: 30000,
      ...config,
    };
  }

  async execute(sql: string): Promise<SqlResult> {
    const startTime = Date.now();

    // Ensure SQL ends with a semicolon
    const finalSql = sql.trim().endsWith(";") ? sql : `${sql};`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.config.timeout,
      );

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      const response = await fetch(this.config.url, {
        method: "POST",
        headers,
        body: JSON.stringify({ query: finalSql }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        return {
          error: `HTTP ${response.status}: ${errorText}`,
        };
      }

      const data = (await response.json()) as Record<string, any>;
      const elapsed = Date.now() - startTime;

      return {
        ...data,
        metadata: {
          ...data.metadata,
          queryTime: elapsed,
        },
      };
    } catch (error: any) {
      if (error.name === "AbortError") {
        return { error: "Query timeout exceeded" };
      }
      return { error: error.message || "Unknown error" };
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const result = await this.execute("SELECT 1 as test");
      return !result.error;
    } catch {
      return false;
    }
  }
}
