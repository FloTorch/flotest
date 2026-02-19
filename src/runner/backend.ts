import type { Config } from "../types/config.ts";
import { OpenAIBackend } from "./backends/openai.ts";
import { RequestFormat, SageMakerBackend } from "./backends/sagemaker.ts";

export interface BackendResponse {
  generatedText: string;
  outputTokens: number;
  ttftMs: number;
  interTokenLatencies: number[];
}

export interface IBackend {
  name: string;
  request(
    prompt: string,
    model: string,
    maxTokens: number,
    systemPrompt: string | undefined,
    params: Record<string, unknown> | undefined,
    streaming: boolean,
    signal: AbortSignal,
  ): Promise<BackendResponse>;
}

export function createBackend(config: Config): IBackend {
  const { adapter, baseURL } = config.provider;

  switch (adapter) {
    case "openai":
      return OpenAIBackend.create(baseURL);
    case "sagemaker": {
      const requestFormat =
        (config.provider.config?.["requestFormat"] as RequestFormat | undefined) ??
        RequestFormat.Sagemaker;
      return SageMakerBackend.create(baseURL, requestFormat);
    }
    default:
      throw new Error(`Unknown backend adapter: ${adapter as string}`);
  }
}
