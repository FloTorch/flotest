import type { IExporter } from "../exporter.ts";
import type { SummaryMetrics, RequestMetrics } from "../../types/metrics.ts";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export class CsvExporter implements IExporter {
  name = "csv";

  async export(
    summary: SummaryMetrics,
    requests: RequestMetrics[],
    outputDir: string,
  ): Promise<void> {
    mkdirSync(outputDir, { recursive: true });
    this.writeSummary(summary, outputDir);
    this.writeRequests(requests, outputDir);
  }

  private writeSummary(summary: SummaryMetrics, outputDir: string): void {
    const metricFields = [
      "ttft",
      "e2eLatency",
      "outputThroughput",
      "interTokenLatency",
      "inputTokens",
      "outputTokens",
    ] as const;
    const statFields = [
      "mean",
      "min",
      "max",
      "stddev",
      "p25",
      "p50",
      "p75",
      "p90",
      "p95",
      "p99",
    ] as const;

    const headers = [
      "totalRequests",
      "successfulRequests",
      "failedRequests",
      "emptyResponses",
      "errorRate",
      "rpm",
      "overallTps",
      "cacheHitRate",
    ];
    const values: (string | number)[] = [
      summary.totalRequests,
      summary.successfulRequests,
      summary.failedRequests,
      summary.emptyResponses,
      summary.errorRate,
      summary.rpm,
      summary.overallTps,
      summary.cacheHitRate,
    ];

    for (const metric of metricFields) {
      const agg = summary[metric];
      for (const stat of statFields) {
        headers.push(`${metric}_${stat}`);
        values.push(agg[stat]);
      }
    }

    const csv = [headers.join(","), values.join(",")].join("\n");
    writeFileSync(join(outputDir, "summary.csv"), csv);
  }

  private writeRequests(requests: RequestMetrics[], outputDir: string): void {
    if (requests.length === 0) return;

    const headers = [
      "requestId",
      "startTime",
      "endTime",
      "ttftMs",
      "e2eLatencyMs",
      "inputTokens",
      "outputTokens",
      "outputThroughputTps",
      "phase",
      "cacheHit",
      "error",
      "errorCode",
    ];

    const rows = requests.map((r) =>
      [
        r.requestId,
        r.startTime,
        r.endTime,
        r.ttftMs,
        r.e2eLatencyMs,
        r.inputTokens,
        r.outputTokens,
        r.outputThroughputTps,
        r.phase,
        r.cacheHit,
        r.error ?? "",
        r.errorCode ?? "",
      ].join(","),
    );

    const csv = [headers.join(","), ...rows].join("\n");
    writeFileSync(join(outputDir, "requests.csv"), csv);
  }
}
