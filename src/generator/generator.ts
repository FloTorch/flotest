import type { PromptRecord } from "../types/prompt.ts";
import type { Config } from "../types/config.ts";
import { SyntheticGenerator } from "./synthetic.ts";
import { FileGenerator } from "./file.ts";

export interface IGenerator {
  generate(count: number): Promise<PromptRecord[]>;
  generateOne(targetInputTokens: number, targetOutputTokens: number): PromptRecord;
}

export function createGenerator(config: Config): IGenerator {
  if (config.generator.enabled) {
    return new SyntheticGenerator(config);
  }
  if (config.benchmark.inputFile) {
    return new FileGenerator(config.benchmark.inputFile);
  }
  return new SyntheticGenerator(config);
}
