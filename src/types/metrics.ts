export type Phase = "ramp-up" | "steady" | "ramp-down";

export interface RequestMetrics {
  requestId: string;
  startTime: number;
  endTime: number;
  ttftMs: number;
  ttfntMs?: number;
  e2eLatencyMs: number;
  interTokenLatencies: number[];
  inputText: string;
  inputTokens: number;
  outputTokens: number;
  outputThroughputTps: number;
  generatedText: string;
  error?: string;
  errorCode?: string;
  phase: Phase;
  cacheHit: boolean;
  turn?: number;
}

export interface MetricAggregate {
  mean: number;
  min: number;
  max: number;
  stddev: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
}

export interface SummaryMetrics {
  startTime: number;
  endTime: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  emptyResponses: number;
  errorRate: number;
  rpm: number;
  overallTps: number;
  ttft: MetricAggregate;
  ttfnt?: MetricAggregate;
  e2eLatency: MetricAggregate;
  outputThroughput: MetricAggregate;
  interTokenLatency: MetricAggregate;
  inputTokens: MetricAggregate;
  outputTokens: MetricAggregate;
  errorCodeFrequency: Record<string, number>;
  cacheHitRate: number;
  phaseBreakdown: Record<string, { requests: number; errorRate: number }>;
}
