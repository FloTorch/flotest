import type { IGenerator } from "./generator.ts";
import type { PromptRecord } from "../types/prompt.ts";
import { countTokens } from "./tokenizer.ts";
import { readFileSync } from "node:fs";

export class FileGenerator implements IGenerator {
  private records: PromptRecord[];

  constructor(filePath: string) {
    const content = readFileSync(filePath, "utf-8");
    this.records = content
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const parsed = JSON.parse(line) as {
          text?: string;
          prompt?: string;
          tokenCount?: number;
          outputTokenTarget?: number;
          max_tokens?: number;
        };
        const text = parsed.text ?? parsed.prompt ?? "";
        return {
          text,
          tokenCount: parsed.tokenCount ?? countTokens(text),
          outputTokenTarget: parsed.outputTokenTarget ?? parsed.max_tokens ?? 256,
        };
      });
  }

  generate(count: number): PromptRecord[] {
    const results: PromptRecord[] = [];
    for (let i = 0; i < count; i++) {
      results.push(this.records[i % this.records.length]!);
    }
    return results;
  }

  generateOne(_targetInputTokens: number, targetOutputTokens: number): PromptRecord {
    const record = this.records[Math.floor(Math.random() * this.records.length)]!;
    return { ...record, outputTokenTarget: targetOutputTokens };
  }
}
