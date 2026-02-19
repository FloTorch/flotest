import type { RequestMetrics } from "../types/metrics.ts";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export class WAL {
  private logPath: string;
  private responsesDir: string;

  constructor(outputDir: string) {
    this.logPath = join(outputDir, "run_log.jsonl");
    this.responsesDir = join(outputDir, "individual_responses");
    mkdirSync(this.responsesDir, { recursive: true });
  }

  write(metrics: RequestMetrics): void {
    appendFileSync(this.logPath, JSON.stringify(metrics) + "\n");
    writeFileSync(
      join(this.responsesDir, `${metrics.requestId}.json`),
      JSON.stringify(metrics, null, 2),
    );
  }

  static readLog(outputDir: string): RequestMetrics[] {
    const logPath = join(outputDir, "run_log.jsonl");
    const content = require("node:fs").readFileSync(logPath, "utf-8") as string;
    return content
      .split("\n")
      .filter((line: string) => line.trim().length > 0)
      .map((line: string) => JSON.parse(line) as RequestMetrics);
  }
}
