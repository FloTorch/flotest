import { z } from "zod";
import type { IBackend, BackendResponse } from "../backend.ts";
import { countTokens } from "../../generator/tokenizer.ts";
import { validateEnv } from "../../schemas/config.zod.ts";

const EnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
});

interface ChatMessage {
  role: string;
  content: string;
}

interface ChatCompletionChunk {
  choices?: { delta?: { content?: string }; finish_reason?: string | null }[];
  usage?: { completion_tokens?: number };
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { completion_tokens?: number };
}

export class OpenAIBackend implements IBackend {
  name = "openai";
  private url: string;
  private apiKey: string;

  static create(baseURL?: string): OpenAIBackend {
    const env = validateEnv(EnvSchema, "openai");
    const url = baseURL ?? "https://api.openai.com/v1";
    return new OpenAIBackend(url, env.OPENAI_API_KEY);
  }

  constructor(baseURL: string, apiKey: string) {
    this.url = baseURL.endsWith("/") ? baseURL : `${baseURL.replace(/\/+$/, "")}/chat/completions`;
    this.apiKey = apiKey;
  }

  async request(
    prompt: string,
    model: string,
    maxTokens: number,
    systemPrompt: string | undefined,
    params: Record<string, unknown> | undefined,
    streaming: boolean,
    signal: AbortSignal,
  ): Promise<BackendResponse> {
    const messages: ChatMessage[] = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    const body: Record<string, unknown> = {
      messages,
      stream: streaming,
      ...params,
      model,
      max_tokens: maxTokens,
    };

    // OpenAI accepts max_completion_tokens for all models and requires it
    // for reasoning models (o1, o3, o4-mini) which reject max_tokens.
    // Non-OpenAI endpoints (vLLM, SageMaker LMI, Ollama) use max_tokens.
    if (this.isOpenAIHost()) {
      body.max_completion_tokens = body.max_tokens;
      delete body.max_tokens;
    }

    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      const text = await response.text();
      const error = new Error(`HTTP ${response.status}: ${text}`);
      (error as unknown as Record<string, unknown>).code = String(response.status);
      throw error;
    }

    if (streaming) {
      return this.parseStream(response);
    }
    return this.parseResponse(response);
  }

  private isOpenAIHost(): boolean {
    return this.url.includes("api.openai.com");
  }

  private async parseStream(response: Response): Promise<BackendResponse> {
    const body = response.body;
    if (!body) throw new Error("No response body");

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let generatedText = "";
    let ttftMs = 0;
    const requestStart = performance.now();
    let lastChunkTime = requestStart;
    const interTokenLatencies: number[] = [];
    let firstToken = true;
    let outputTokens = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;

          let chunk: ChatCompletionChunk;
          try {
            chunk = JSON.parse(data) as ChatCompletionChunk;
          } catch {
            continue;
          }

          const content = chunk.choices?.[0]?.delta?.content;
          if (content) {
            const now = performance.now();
            if (firstToken) {
              ttftMs = now - requestStart;
              firstToken = false;
            } else {
              interTokenLatencies.push(now - lastChunkTime);
            }
            lastChunkTime = now;
            generatedText += content;
          }

          if (chunk.usage?.completion_tokens) {
            outputTokens = chunk.usage.completion_tokens;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (outputTokens === 0) {
      outputTokens = countTokens(generatedText);
    }

    return { generatedText, outputTokens, ttftMs, interTokenLatencies };
  }

  private async parseResponse(response: Response): Promise<BackendResponse> {
    const requestStart = performance.now();
    const json = (await response.json()) as ChatCompletionResponse;
    const ttftMs = performance.now() - requestStart;
    const generatedText = json.choices?.[0]?.message?.content ?? "";
    const outputTokens = json.usage?.completion_tokens ?? countTokens(generatedText);

    return { generatedText, outputTokens, ttftMs, interTokenLatencies: [] };
  }
}
