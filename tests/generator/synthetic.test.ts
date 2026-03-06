import { describe, it, expect } from "vitest";
import { SyntheticGenerator } from "../../src/generator/synthetic.ts";
import { countTokens } from "../../src/generator/tokenizer.ts";
import type { Config } from "../../src/types/config.ts";

function makeConfig(overrides: Partial<{
  inputMean: number;
  inputStddev: number;
  outputMean: number;
  outputStddev: number;
  maxRequests: number;
}> = {}): Config {
  return {
    generator: { enabled: true },
    benchmark: {
      inputTokens: { mean: overrides.inputMean ?? 100, stddev: overrides.inputStddev ?? 10 },
      outputTokens: { mean: overrides.outputMean ?? 50, stddev: overrides.outputStddev ?? 5 },
      maxRequests: overrides.maxRequests ?? 10,
      concurrency: 1,
      timeout: 600,
      outputDir: "./results",
      streaming: true,
      cachePercentage: 0,
    },
    provider: { adapter: "openai", model: "test-model" },
    reporter: { adapters: ["json"] },
  } as Config;
}

describe("SyntheticGenerator", () => {
  it("generates the requested number of prompts", () => {
    const gen = new SyntheticGenerator(makeConfig());
    const prompts = gen.generate(5);
    expect(prompts).toHaveLength(5);
  });

  it("each prompt has text, tokenCount, and outputTokenTarget", () => {
    const gen = new SyntheticGenerator(makeConfig());
    const [prompt] = gen.generate(1);
    expect(prompt.text).toBeTruthy();
    expect(prompt.tokenCount).toBeGreaterThan(0);
    expect(prompt.outputTokenTarget).toBeGreaterThan(0);
  });

  it("tokenCount roughly matches actual token count", () => {
    const gen = new SyntheticGenerator(makeConfig({ inputMean: 200 }));
    const [prompt] = gen.generate(1);
    const actual = countTokens(prompt.text);
    expect(prompt.tokenCount).toBe(actual);
  });

  it("handles high token count targets", () => {
    const gen = new SyntheticGenerator(makeConfig({ inputMean: 2000, inputStddev: 100 }));
    const prompts = gen.generate(3);
    for (const p of prompts) {
      expect(p.tokenCount).toBeGreaterThan(1000);
    }
  });
});
