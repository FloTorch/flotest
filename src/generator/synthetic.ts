import type { IGenerator } from "./generator.ts";
import type { PromptRecord } from "../types/prompt.ts";
import type { Config } from "../types/config.ts";
import { countTokens } from "./tokenizer.ts";
import { clampedGaussian } from "../utils/random.ts";
import { readFileSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { availableParallelism } from "node:os";
import defaultCorpus from "./corpus/default.ts";

export class SyntheticGenerator implements IGenerator {
  private lines: string[];
  private config: Config;
  private lineTokenCache = new Map<string, number>();

  constructor(config: Config) {
    this.config = config;
    const corpus = config.generator.corpus
      ? readFileSync(config.generator.corpus, "utf-8")
      : defaultCorpus;
    this.lines = corpus
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }

  private lineTokenCount(line: string): number {
    let count = this.lineTokenCache.get(line);
    if (count === undefined) {
      count = countTokens(line);
      this.lineTokenCache.set(line, count);
    }
    return count;
  }

  async generate(count: number): Promise<PromptRecord[]> {
    const inputMean = this.config.benchmark.inputTokens.mean;
    const inputStddev = this.config.benchmark.inputTokens.stddev ?? inputMean * 0.1;
    const outputMean = this.config.benchmark.outputTokens.mean;
    const outputStddev = this.config.benchmark.outputTokens.stddev ?? outputMean * 0.1;

    const batches = Array.from({ length: count }, () => ({
      targetInput: clampedGaussian(inputMean, inputStddev, 1, inputMean * 3),
      targetOutput: clampedGaussian(outputMean, outputStddev, 1, outputMean * 3),
    }));

    // For small counts, run in-process (worker overhead not worth it)
    if (count <= 10) {
      return batches.map(({ targetInput, targetOutput }) =>
        this.generateOne(targetInput, targetOutput),
      );
    }

    // Split batches across workers
    const numWorkers = Math.min(availableParallelism(), count);
    const chunkSize = Math.ceil(count / numWorkers);
    const chunks: Array<Array<{ targetInput: number; targetOutput: number }>> = [];
    for (let i = 0; i < count; i += chunkSize) {
      chunks.push(batches.slice(i, i + chunkSize));
    }

    const currentFile = fileURLToPath(import.meta.url);
    const currentDir = dirname(currentFile);
    const ext = currentFile.endsWith(".ts") ? ".ts" : ".js";
    const workerPath = join(currentDir, `prompt-worker${ext}`);

    const prompt = this.config.generator.prompt ?? "";

    const workerPromises = chunks.map(
      (chunk) =>
        new Promise<PromptRecord[]>((resolve, reject) => {
          const worker = new Worker(workerPath, {
            workerData: { lines: this.lines, prompt, batches: chunk },
          });
          worker.on("message", resolve);
          worker.on("error", reject);
        }),
    );

    const results = await Promise.all(workerPromises);
    return results.flat();
  }

  generateOne(targetInputTokens: number, targetOutputTokens: number): PromptRecord {
    const shuffled = [...this.lines].sort(() => Math.random() - 0.5);
    const parts: string[] = [];
    let estimatedTokens = 0;
    let lineIdx = 0;

    while (estimatedTokens < targetInputTokens && lineIdx < shuffled.length) {
      const line = shuffled[lineIdx]!;
      const lineTokens = this.lineTokenCount(line);
      if (estimatedTokens + lineTokens > targetInputTokens && parts.length > 0) break;
      parts.push(line);
      estimatedTokens += lineTokens;
      lineIdx++;
    }

    // If we haven't reached the target, repeat lines
    while (estimatedTokens < targetInputTokens) {
      const line = shuffled[lineIdx % shuffled.length]!;
      const lineTokens = this.lineTokenCount(line);
      if (estimatedTokens + lineTokens > targetInputTokens * 1.1) break;
      parts.push(line);
      estimatedTokens += lineTokens;
      lineIdx++;
    }

    const text = parts.join("\n");
    const suffix = this.config.generator.prompt ?? "";
    const header = `Randomly stream lines from the following text with ${targetOutputTokens} output tokens. Don't generate eos tokens:\n\n`;
    const fullText = header + text + (suffix ? `\n${suffix}` : "");
    const finalTokens = countTokens(fullText);

    return {
      text: fullText,
      tokenCount: finalTokens,
      outputTokenTarget: targetOutputTokens,
    };
  }
}
