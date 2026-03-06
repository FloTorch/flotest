import { describe, it, expect } from "vitest";
import { SyntheticGenerator } from "../../src/generator/synthetic.ts";
import { makeConfig } from "../helpers.ts";

describe("SyntheticGenerator performance", () => {
  it("generates a 5000-token prompt in under 2 seconds", async () => {
    const gen = new SyntheticGenerator(makeConfig({ inputMean: 5000 }));
    const start = performance.now();
    const prompts = await gen.generate(1);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(2000);
    expect(prompts[0].tokenCount).toBeGreaterThan(3000);
  });

  it("generates 1000 prompts with 50k input tokens each", async () => {
    const gen = new SyntheticGenerator(makeConfig({ inputMean: 50000, maxRequests: 1000 }));

    const start = performance.now();
    const prompts = await gen.generate(1000);
    const elapsed = performance.now() - start;

    console.log(`\n  1000 x 50k-token prompts: ${(elapsed / 1000).toFixed(2)}s`);
    console.log(`  Avg per prompt: ${(elapsed / 1000).toFixed(1)}ms`);
    console.log(`  Sample token counts: ${prompts.slice(0, 5).map((p) => p.tokenCount).join(", ")}`);

    expect(prompts).toHaveLength(1000);
    for (const p of prompts.slice(0, 10)) {
      expect(p.tokenCount).toBeGreaterThan(30000);
      expect(p.text).toBeTruthy();
      expect(p.outputTokenTarget).toBeGreaterThan(0);
    }
  }, 120_000);
});
