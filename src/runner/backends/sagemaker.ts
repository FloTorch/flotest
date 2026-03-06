import { z } from "zod";
import { SignatureV4 } from "@smithy/signature-v4";
import { Hash } from "@smithy/hash-node";
import { HttpRequest } from "@smithy/protocol-http";
import type { IBackend, BackendResponse } from "../backend.ts";
import { countTokens } from "../../generator/tokenizer.ts";
import { validateEnv } from "../../schemas/config.zod.ts";

const EnvSchema = z
  .object({
    AWS_REGION: z.string().optional(),
    AWS_DEFAULT_REGION: z.string().optional(),
    AWS_ACCESS_KEY_ID: z.string().min(1, "AWS_ACCESS_KEY_ID is required"),
    AWS_SECRET_ACCESS_KEY: z.string().min(1, "AWS_SECRET_ACCESS_KEY is required"),
    AWS_SESSION_TOKEN: z.string().optional(),
  })
  .transform((env) => ({
    ...env,
    AWS_REGION: env.AWS_REGION ?? env.AWS_DEFAULT_REGION ?? "us-east-1",
  }));

/**
 * Controls how request bodies are built and responses are parsed for SageMaker endpoints.
 *
 * **OpenAI (recommended default)** — Sends the Chat Completions `messages` format.
 * Modern LMI/vLLM containers auto-detect the `messages` field and apply the model's
 * chat template server-side, returning an OpenAI-compatible response.
 *
 * **Sagemaker (legacy)** — Sends a raw text string via the `inputs` field.
 * Use this only for legacy containers that do not support the `messages` format.
 * The caller is responsible for prompt formatting; no chat template is applied.
 *
 * References:
 * - HuggingFace TGI maintenance mode (Dec 2025): https://github.com/huggingface/text-generation-inference
 * - LMI Chat Completions API schema (auto-detects `messages`):
 *     https://docs.djl.ai/master/docs/serving/serving/docs/lmi/user_guides/chat_input_output_schema.html
 *     "If the request contains the messages field, LMI will treat the request as a
 *      chat completions style request, and respond back with the chat completions response style."
 *     "On SageMaker, Chat Completions API schema is supported with the /invocations endpoint
 *      without additional configurations."
 * - LMI standard input/output schema (raw `inputs` string):
 *     https://docs.djl.ai/master/docs/serving/serving/docs/lmi/user_guides/lmi_input_output_schema.html
 * - AWS vLLM DLC on SageMaker:
 *     https://docs.aws.amazon.com/deep-learning-containers/latest/devguide/dlc-vllm-sagemaker.html
 * - AWS LMI container docs:
 *     https://docs.aws.amazon.com/sagemaker/latest/dg/large-model-inference-container-docs.html
 */
export enum RequestFormat {
  OpenAI = "openai",
  Sagemaker = "sagemaker",
}

export interface SageMakerConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  baseURL?: string;
  requestFormat?: RequestFormat;
}

class Sha256Hash extends Hash {
  constructor(secret?: string | ArrayBuffer | ArrayBufferView) {
    super("sha256", secret);
  }
}

export class SageMakerBackend implements IBackend {
  name = "sagemaker";
  private signer: SignatureV4;
  private baseURL: string;
  private requestFormat: RequestFormat;

  static create(baseURL?: string, requestFormat?: RequestFormat): SageMakerBackend {
    const env = validateEnv(EnvSchema, "sagemaker");
    const region = env.AWS_REGION;
    return new SageMakerBackend({
      region,
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      sessionToken: env.AWS_SESSION_TOKEN,
      baseURL,
      requestFormat,
    });
  }

  constructor(config: SageMakerConfig) {
    this.baseURL = config.baseURL ?? `https://runtime.sagemaker.${config.region}.amazonaws.com`;
    this.requestFormat = config.requestFormat ?? RequestFormat.OpenAI;
    this.signer = new SignatureV4({
      service: "sagemaker",
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        sessionToken: config.sessionToken,
      },
      sha256: Sha256Hash,
    });
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
    const path = streaming
      ? `/endpoints/${model}/invocations-response-stream`
      : `/endpoints/${model}/invocations`;

    const body = this.buildRequestBody(prompt, maxTokens, systemPrompt, params, streaming);
    const bodyStr = JSON.stringify(body);

    const url = new URL(path, this.baseURL);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      host: url.hostname,
    };
    if (streaming) {
      headers["X-Amzn-SageMaker-InferenceComponent-Inference-Code-Accepts"] =
        "application/jsonlines";
    }

    const httpRequest = new HttpRequest({
      method: "POST",
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port ? Number(url.port) : undefined,
      path: url.pathname,
      headers,
      body: bodyStr,
    });

    const signed = await this.signer.sign(httpRequest);

    const requestStart = performance.now();
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: signed.headers as Record<string, string>,
      body: bodyStr,
      signal,
    });

    if (!response.ok) {
      const text = await response.text();
      const error = new Error(`HTTP ${response.status}: ${text}`);
      (error as unknown as Record<string, unknown>).code = String(response.status);
      throw error;
    }

    if (streaming) {
      return this.parseEventStream(response, requestStart);
    }
    return this.parseResponse(response, requestStart);
  }

  private buildRequestBody(
    prompt: string,
    maxTokens: number,
    systemPrompt: string | undefined,
    params: Record<string, unknown> | undefined,
    streaming: boolean,
  ): Record<string, unknown> {
    if (this.requestFormat === RequestFormat.OpenAI) {
      // Chat Completions format: LMI/vLLM auto-detects the `messages` field,
      // applies the model's chat template server-side, and returns an
      // OpenAI-compatible response.
      const messages: { role: string; content: string }[] = [];
      if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
      messages.push({ role: "user", content: prompt });
      return {
        messages,
        stream: streaming,
        ...params,
        max_tokens: maxTokens,
      };
    }

    // Legacy raw text format: sends a plain string via `inputs`.
    // No chat template is applied — the caller is responsible for formatting.
    const rawPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
    return {
      inputs: rawPrompt,
      parameters: {
        ...params,
        max_new_tokens: maxTokens,
        ...(streaming ? { stream: true } : {}),
      },
    };
  }

  // ---- Streaming: eventstream binary parser ----

  private async parseEventStream(
    response: Response,
    requestStart: number,
  ): Promise<BackendResponse> {
    const body = response.body;
    if (!body) throw new Error("No response body");

    const reader = body.getReader();
    let buffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
    let generatedText = "";
    let ttftMs = 0;
    let lastChunkTime = requestStart;
    const interTokenLatencies: number[] = [];
    let firstToken = true;
    let outputTokens = 0;
    let sseBuffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer = concatBytes(buffer, value);

        while (true) {
          const parsed = readEventStreamMessage(buffer);
          if (!parsed) break;

          const { message, bytesConsumed } = parsed;
          buffer = buffer.slice(bytesConsumed);

          if (message.headers[":message-type"] === "exception") {
            const errText = new TextDecoder().decode(message.payload);
            throw new Error(
              `SageMaker stream exception (${message.headers[":event-type"]}): ${errText}`,
            );
          }

          if (message.headers[":event-type"] !== "PayloadPart") continue;

          const payloadText = new TextDecoder().decode(message.payload);

          if (this.requestFormat === RequestFormat.OpenAI) {
            sseBuffer += payloadText;
            const lines = sseBuffer.split("\n");
            sseBuffer = lines.pop()!;

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;

              // SSE format: lines prefixed with "data: "
              let jsonStr: string;
              if (trimmed.startsWith("data: ")) {
                const data = trimmed.slice(6);
                if (data === "[DONE]") continue;
                jsonStr = data;
              } else {
                // Some containers send raw JSON without SSE framing
                jsonStr = trimmed;
              }

              let chunk: {
                choices?: {
                  delta?: { content?: string };
                }[];
                usage?: { completion_tokens?: number };
                token?: { text?: string };
                generated_text?: string;
                details?: { generated_tokens?: number };
              };
              try {
                chunk = JSON.parse(jsonStr);
              } catch {
                continue;
              }

              // Try OpenAI delta format first, then legacy token.text
              const content = chunk.choices?.[0]?.delta?.content ?? chunk.token?.text;
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
              } else if (typeof chunk.generated_text === "string" && !generatedText) {
                generatedText = chunk.generated_text;
              }

              if (chunk.usage?.completion_tokens) {
                outputTokens = chunk.usage.completion_tokens;
              }
              if (chunk.details?.generated_tokens) {
                outputTokens = chunk.details.generated_tokens;
              }
            }
          } else {
            const jsonLines = payloadText.split("\n").filter((l) => l.trim());
            for (const jsonLine of jsonLines) {
              let chunk: Record<string, unknown>;
              try {
                chunk = JSON.parse(jsonLine);
              } catch {
                continue;
              }

              const tokenText = (chunk.token as { text?: string } | undefined)?.text;
              if (tokenText) {
                const now = performance.now();
                if (firstToken) {
                  ttftMs = now - requestStart;
                  firstToken = false;
                } else {
                  interTokenLatencies.push(now - lastChunkTime);
                }
                lastChunkTime = now;
                generatedText += tokenText;
              } else if (typeof chunk.generated_text === "string" && !generatedText) {
                generatedText = chunk.generated_text;
              }

              const details = chunk.details as { generated_tokens?: number } | undefined;
              if (details?.generated_tokens) {
                outputTokens = details.generated_tokens;
              }
            }
          }
        }
      }

      // Flush any remaining SSE data not terminated by a newline
      if (this.requestFormat === RequestFormat.OpenAI && sseBuffer.trim()) {
        const trimmed = sseBuffer.trim();
        let jsonStr: string | null = null;
        if (trimmed.startsWith("data: ")) {
          const data = trimmed.slice(6);
          if (data !== "[DONE]") jsonStr = data;
        } else {
          jsonStr = trimmed;
        }
        if (jsonStr) {
          try {
            const chunk = JSON.parse(jsonStr) as {
              choices?: { delta?: { content?: string } }[];
              usage?: { completion_tokens?: number };
              token?: { text?: string };
              details?: { generated_tokens?: number };
            };
            const content = chunk.choices?.[0]?.delta?.content ?? chunk.token?.text;
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
            if (chunk.details?.generated_tokens) {
              outputTokens = chunk.details.generated_tokens;
            }
          } catch {
            // ignore malformed final chunk
          }
        }
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }

    if (outputTokens === 0) {
      outputTokens = countTokens(generatedText);
    }

    return { generatedText, outputTokens, ttftMs, interTokenLatencies };
  }

  // ---- Non-streaming ----

  private async parseResponse(response: Response, requestStart: number): Promise<BackendResponse> {
    const rawText = await response.text();
    const ttftMs = performance.now() - requestStart;

    let json: unknown;
    try {
      json = JSON.parse(rawText);
    } catch {
      // Response is not JSON — treat the raw text as the generated output
      const generatedText = rawText;
      const outputTokens = countTokens(generatedText);
      return { generatedText, outputTokens, ttftMs, interTokenLatencies: [] };
    }

    let generatedText = "";
    let outputTokens = 0;

    if (this.requestFormat === RequestFormat.OpenAI) {
      const data = json as {
        choices?: { message?: { content?: string }; text?: string }[];
        usage?: { completion_tokens?: number };
      };
      generatedText = data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text ?? "";
      outputTokens = data.usage?.completion_tokens ?? 0;
    }

    // Fallback: if OpenAI format yielded nothing (or legacy format selected),
    // try the legacy generated_text format that many SageMaker containers use.
    if (!generatedText) {
      if (Array.isArray(json)) {
        generatedText = (json[0] as { generated_text?: string })?.generated_text ?? "";
      } else {
        const data = json as { generated_text?: string };
        generatedText = data.generated_text ?? "";
      }
    }

    if (outputTokens === 0) {
      outputTokens = countTokens(generatedText);
    }

    return {
      generatedText,
      outputTokens,
      ttftMs,
      interTokenLatencies: [],
    };
  }
}

// ---- AWS Event Stream binary framing ----

interface EventStreamMsg {
  headers: Record<string, string>;
  payload: Uint8Array;
}

function concatBytes(a: Uint8Array<ArrayBufferLike>, b: Uint8Array<ArrayBufferLike>): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function readEventStreamMessage(
  buf: Uint8Array<ArrayBufferLike>,
): { message: EventStreamMsg; bytesConsumed: number } | null {
  if (buf.length < 16) return null; // prelude (12) + message CRC (4)

  const view = new DataView(buf.buffer, buf.byteOffset);
  const totalLength = view.getUint32(0);
  const headersLength = view.getUint32(4);
  // bytes 8–11: prelude CRC (skip verification for perf)

  if (buf.length < totalLength) return null;

  const headers: Record<string, string> = {};
  let offset = 12;
  const headersEnd = 12 + headersLength;

  while (offset < headersEnd) {
    const nameLen = buf[offset]!;
    offset++;
    const name = new TextDecoder().decode(buf.slice(offset, offset + nameLen));
    offset += nameLen;

    const valueType = buf[offset]!;
    offset++;

    if (valueType === 7) {
      // type 7: string (2-byte length prefix + value)
      const valueLen = new DataView(buf.buffer, buf.byteOffset + offset).getUint16(0);
      offset += 2;
      headers[name] = new TextDecoder().decode(buf.slice(offset, offset + valueLen));
      offset += valueLen;
    } else if (valueType === 0) {
      // type 0: bool (1 byte)
      offset += 1;
    } else if (valueType === 1) {
      // type 1: byte (1 byte)
      offset += 1;
    } else if (valueType === 2) {
      // type 2: short (2 bytes)
      offset += 2;
    } else if (valueType === 3) {
      // type 3: int (4 bytes)
      offset += 4;
    } else if (valueType === 4) {
      // type 4: long (8 bytes)
      offset += 8;
    } else if (valueType === 5) {
      // type 5: timestamp (8 bytes)
      offset += 8;
    } else if (valueType === 6) {
      // type 6: bytes (2-byte length prefix + value)
      const valueLen = new DataView(buf.buffer, buf.byteOffset + offset).getUint16(0);
      offset += 2 + valueLen;
    } else if (valueType === 8) {
      // type 8: uuid (16 bytes)
      offset += 16;
    } else {
      // Truly unknown type — cannot determine size, stop parsing headers
      break;
    }
  }

  const payloadLength = totalLength - headersLength - 16;
  const payloadOffset = 12 + headersLength;
  const payload = buf.slice(payloadOffset, payloadOffset + payloadLength);

  return { message: { headers, payload }, bytesConsumed: totalLength };
}
