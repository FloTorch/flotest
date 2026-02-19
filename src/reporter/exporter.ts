import type { SummaryMetrics, RequestMetrics } from "../types/metrics.ts";
import type { Config } from "../types/config.ts";
import { JsonExporter } from "./exporters/json.ts";
import { CsvExporter } from "./exporters/csv.ts";

export interface IExporter {
  name: string;
  export(summary: SummaryMetrics, requests: RequestMetrics[], outputDir: string): Promise<void>;
}

export function createExporters(config: Config): IExporter[] {
  const adapters = config.reporter.adapters;
  const exporters: IExporter[] = [];

  for (const adapter of adapters) {
    switch (adapter) {
      case "json":
        exporters.push(new JsonExporter());
        break;
      case "csv":
        exporters.push(new CsvExporter());
        break;
    }
  }

  return exporters;
}
