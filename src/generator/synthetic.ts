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
    let text = "";
    let tokens = 0;
    let lineIdx = 0;

    while (tokens < targetInputTokens && lineIdx < shuffled.length) {
      const candidate = text ? `${text}\n${shuffled[lineIdx]!}` : shuffled[lineIdx]!;
      const candidateTokens = countTokens(candidate);
      if (candidateTokens > targetInputTokens && text.length > 0) break;
      text = candidate;
      tokens = candidateTokens;
      lineIdx++;
    }

    // If we haven't reached the target, repeat lines
    while (tokens < targetInputTokens) {
      const line = shuffled[lineIdx % shuffled.length]!;
      const candidate = `${text}\n${line}`;
      const candidateTokens = countTokens(candidate);
      if (candidateTokens > targetInputTokens * 1.1) break;
      text = candidate;
      tokens = candidateTokens;
      lineIdx++;
    }

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
