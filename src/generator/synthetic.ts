import type { IGenerator } from "./generator.ts";
import type { PromptRecord } from "../types/prompt.ts";
import type { Config } from "../types/config.ts";
import { countTokens } from "./tokenizer.ts";
import { clampedGaussian } from "../utils/random.ts";
import { readFileSync } from "node:fs";
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

  generate(count: number): PromptRecord[] {
    const records: PromptRecord[] = [];
    const inputMean = this.config.benchmark.inputTokens.mean;
    const inputStddev = this.config.benchmark.inputTokens.stddev ?? inputMean * 0.1;
    const outputMean = this.config.benchmark.outputTokens.mean;
    const outputStddev = this.config.benchmark.outputTokens.stddev ?? outputMean * 0.1;

    for (let i = 0; i < count; i++) {
      const targetInput = clampedGaussian(inputMean, inputStddev, 1, inputMean * 3);
      const targetOutput = clampedGaussian(outputMean, outputStddev, 1, outputMean * 3);
      records.push(this.generateOne(targetInput, targetOutput));
    }
    return records;
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
