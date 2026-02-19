import type { IExporter } from "../exporter.ts";
import type { SummaryMetrics, RequestMetrics } from "../../types/metrics.ts";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export class JsonExporter implements IExporter {
  name = "json";

  async export(
    summary: SummaryMetrics,
    _requests: RequestMetrics[],
    outputDir: string,
  ): Promise<void> {
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(join(outputDir, "summary.json"), JSON.stringify(summary, null, 2));
  }
}
