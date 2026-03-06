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
  it("generates the requested number of prompts", async () => {
    const gen = new SyntheticGenerator(makeConfig());
    const prompts = await gen.generate(5);
    expect(prompts).toHaveLength(5);
  });

  it("each prompt has text, tokenCount, and outputTokenTarget", async () => {
    const gen = new SyntheticGenerator(makeConfig());
    const [prompt] = await gen.generate(1);
    expect(prompt.text).toBeTruthy();
    expect(prompt.tokenCount).toBeGreaterThan(0);
    expect(prompt.outputTokenTarget).toBeGreaterThan(0);
  });

  it("tokenCount roughly matches actual token count", async () => {
    const gen = new SyntheticGenerator(makeConfig({ inputMean: 200 }));
    const [prompt] = await gen.generate(1);
    const actual = countTokens(prompt.text);
    expect(prompt.tokenCount).toBe(actual);
  });

  it("handles high token count targets", async () => {
    const gen = new SyntheticGenerator(makeConfig({ inputMean: 2000, inputStddev: 100 }));
    const prompts = await gen.generate(3);
    for (const p of prompts) {
      expect(p.tokenCount).toBeGreaterThan(1000);
    }
  });

  it("generates a 5000-token prompt in under 2 seconds", async () => {
    const gen = new SyntheticGenerator(makeConfig({ inputMean: 5000, inputStddev: 100 }));
    const start = performance.now();
    const prompts = await gen.generate(1);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(2000);
    expect(prompts[0].tokenCount).toBeGreaterThan(3000);
  });

  it("generates correct count in parallel mode (>10 prompts)", async () => {
    const gen = new SyntheticGenerator(makeConfig({ inputMean: 500 }));
    const prompts = await gen.generate(20);
    expect(prompts).toHaveLength(20);
    for (const p of prompts) {
      expect(p.tokenCount).toBe(countTokens(p.text));
      expect(p.outputTokenTarget).toBeGreaterThan(0);
    }
  });
});
