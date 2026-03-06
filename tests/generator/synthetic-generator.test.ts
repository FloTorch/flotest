import { describe, it, expect } from "vitest";
import { SyntheticGenerator } from "../../src/generator/synthetic.ts";
import { countTokens } from "../../src/generator/tokenizer.ts";
import { makeConfig } from "../helpers.ts";

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

  it("tokenCount matches actual token count", async () => {
    const gen = new SyntheticGenerator(makeConfig({ inputMean: 200 }));
    const [prompt] = await gen.generate(1);
    const actual = countTokens(prompt.text);
    expect(prompt.tokenCount).toBe(actual);
  });

  it("handles high token count targets", async () => {
    const gen = new SyntheticGenerator(makeConfig({ inputMean: 2000 }));
    const prompts = await gen.generate(3);
    for (const p of prompts) {
      expect(p.tokenCount).toBeGreaterThan(1000);
    }
  });
});

describe("SyntheticGenerator parallel", () => {
  it("generates correct count via worker threads (>10 prompts)", async () => {
    const gen = new SyntheticGenerator(makeConfig({ inputMean: 500 }));
    const prompts = await gen.generate(20);
    expect(prompts).toHaveLength(20);
    for (const p of prompts) {
      expect(p.tokenCount).toBe(countTokens(p.text));
      expect(p.outputTokenTarget).toBeGreaterThan(0);
    }
  });
});
