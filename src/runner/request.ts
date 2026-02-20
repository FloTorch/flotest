import type { IBackend } from "./backend.ts";
import type { PromptRecord } from "../types/prompt.ts";
import type { Config } from "../types/config.ts";
import type { RequestMetrics, Phase } from "../types/metrics.ts";

export async function executeRequest(
  backend: IBackend,
  prompt: PromptRecord,
  config: Config,
  requestId: string,
  phase: Phase,
  cacheHit: boolean,
  signal: AbortSignal,
): Promise<RequestMetrics> {
  const startTime = performance.now();

  try {
    const timeoutMs = config.benchmark.timeout * 1000;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const combinedSignal = AbortSignal.any([signal, timeoutSignal]);

    const response = await backend.request(
      prompt.text,
      config.provider.model,
      prompt.outputTokenTarget,
      config.provider.systemPrompt,
      config.provider.config as Record<string, unknown> | undefined,
      config.benchmark.streaming,
      combinedSignal,
    );

    const endTime = performance.now();
    const e2eLatencyMs = endTime - startTime;

    const isEmpty = response.outputTokens === 0 && response.generatedText === "";

    return {
      requestId,
      startTime,
      endTime,
      ttftMs: isEmpty ? -1 : response.ttftMs,
      e2eLatencyMs,
      interTokenLatencies: response.interTokenLatencies,
      inputText: prompt.text,
      inputTokens: prompt.tokenCount,
      outputTokens: response.outputTokens,
      outputThroughputTps: isEmpty ? 0 : (e2eLatencyMs > 0 ? response.outputTokens / (e2eLatencyMs / 1000) : 0),
      generatedText: response.generatedText,
      phase,
      cacheHit,
    };
  } catch (error) {
    const endTime = performance.now();
    return {
      requestId,
      startTime,
      endTime,
      ttftMs: 0,
      e2eLatencyMs: endTime - startTime,
      interTokenLatencies: [],
      inputText: prompt.text,
      inputTokens: prompt.tokenCount,
      outputTokens: 0,
      outputThroughputTps: 0,
      generatedText: "",
      error: error instanceof Error ? error.message : String(error),
      errorCode: error instanceof Error && "code" in error ? String(error.code) : undefined,
      phase,
      cacheHit,
    };
  }
}
