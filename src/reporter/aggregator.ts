import type { RequestMetrics, SummaryMetrics, Phase } from "../types/metrics.ts";
import { aggregate } from "./statistics.ts";

export function computeSummary(requests: RequestMetrics[]): SummaryMetrics {
  const successful = requests.filter((r) => !r.error);
  const failed = requests.filter((r) => !!r.error);

  const startTime = Math.min(...requests.map((r) => r.startTime));
  const endTime = Math.max(...requests.map((r) => r.endTime));
  const durationMs = endTime - startTime;
  const durationMin = durationMs / 60000;

  const totalOutputTokens = successful.reduce((sum, r) => sum + r.outputTokens, 0);

  const errorCodeFrequency: Record<string, number> = {};
  for (const r of failed) {
    const code = r.errorCode ?? "unknown";
    errorCodeFrequency[code] = (errorCodeFrequency[code] ?? 0) + 1;
  }

  const cacheHits = requests.filter((r) => r.cacheHit).length;

  const phases: Phase[] = ["ramp-up", "steady", "ramp-down"];
  const phaseBreakdown: Record<string, { requests: number; errorRate: number }> = {};
  for (const phase of phases) {
    const phaseReqs = requests.filter((r) => r.phase === phase);
    if (phaseReqs.length > 0) {
      const phaseErrors = phaseReqs.filter((r) => !!r.error).length;
      phaseBreakdown[phase] = {
        requests: phaseReqs.length,
        errorRate: phaseErrors / phaseReqs.length,
      };
    }
  }

  const ttfntValues = successful
    .map((r) => r.ttfntMs)
    .filter((v): v is number => v !== undefined && v > 0);

  const itlValues = successful.flatMap((r) => r.interTokenLatencies);

  return {
    startTime,
    endTime,
    totalRequests: requests.length,
    successfulRequests: successful.length,
    failedRequests: failed.length,
    errorRate: requests.length > 0 ? failed.length / requests.length : 0,
    rpm: durationMin > 0 ? requests.length / durationMin : 0,
    overallTps: durationMs > 0 ? totalOutputTokens / (durationMs / 1000) : 0,
    ttft: aggregate(successful.map((r) => r.ttftMs)),
    ttfnt: ttfntValues.length > 0 ? aggregate(ttfntValues) : undefined,
    e2eLatency: aggregate(successful.map((r) => r.e2eLatencyMs)),
    outputThroughput: aggregate(successful.map((r) => r.outputThroughputTps)),
    interTokenLatency: aggregate(itlValues),
    inputTokens: aggregate(successful.map((r) => r.inputTokens)),
    outputTokens: aggregate(successful.map((r) => r.outputTokens)),
    errorCodeFrequency,
    cacheHitRate: requests.length > 0 ? cacheHits / requests.length : 0,
    phaseBreakdown,
  };
}
