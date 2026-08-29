import type { Config } from "../src/types/config.ts";

export function makeConfig(
  overrides: Partial<{
    inputMean: number;
    inputStddev: number;
    outputMean: number;
    outputStddev: number;
    maxRequests: number;
    cachePercentage: number;
    concurrency: number;
  }> = {},
): Config {
  return {
    generator: { enabled: true },
    benchmark: {
      inputTokens: {
        mean: overrides.inputMean ?? 100,
        stddev: overrides.inputStddev ?? (overrides.inputMean ?? 100) * 0.1,
      },
      outputTokens: {
        mean: overrides.outputMean ?? 50,
        stddev: overrides.outputStddev ?? 5,
      },
      maxRequests: overrides.maxRequests ?? 10,
      concurrency: overrides.concurrency ?? 1,
      timeout: 600,
      outputDir: "./results",
      streaming: true,
      cachePercentage: overrides.cachePercentage ?? 0,
    },
    provider: { adapter: "openai", model: "test-model" },
    http: { keepAliveTimeout: 60, connectTimeout: 10 },
    reporter: { adapters: ["json"] },
  } as Config;
}
