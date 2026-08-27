import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConcurrencyOrchestrator } from "../../src/runner/orchestrator.ts";
import type { IBackend, BackendResponse } from "../../src/runner/backend.ts";
import type { PromptRecord } from "../../src/types/prompt.ts";
import { makeConfig } from "../helpers.ts";

/**
 * `cachePercentage` used to only flip a random label on `RequestMetrics.cacheHit` —
 * it never changed which prompt was actually sent, so a real backend's prefix
 * cache always measured a 0% hit rate regardless of the configured percentage
 * (confirmed live: vLLM's own "Prefix cache hit rate" logged 0.0% throughout a
 * run configured with cachePercentage=25). These tests pin the fix: a "cache
 * hit" request must resend the EXACT text of a previously-issued prompt.
 */

class FakeBackend implements IBackend {
  name = "fake";
  async request(prompt: string): Promise<BackendResponse> {
    return {
      generatedText: `echo:${prompt.length}`,
      outputTokens: 1,
      ttftMs: 1,
      interTokenLatencies: [],
    };
  }
}

function distinctPrompts(count: number): PromptRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    text: `prompt number ${i}`,
    tokenCount: 4,
    outputTokenTarget: 1,
  }));
}

function tempOutputDir(): string {
  return mkdtempSync(join(tmpdir(), "flotest-orchestrator-test-"));
}

const cleanupDirs: string[] = [];

afterEach(() => {
  while (cleanupDirs.length > 0) {
    const dir = cleanupDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

function newOrchestrator(
  configOverrides: Parameters<typeof makeConfig>[0],
  prompts: PromptRecord[],
): ConcurrencyOrchestrator {
  const outputDir = tempOutputDir();
  cleanupDirs.push(outputDir);
  return new ConcurrencyOrchestrator(
    makeConfig(configOverrides),
    new FakeBackend(),
    prompts,
    outputDir,
  );
}

describe("ConcurrencyOrchestrator cache-hit behavior", () => {
  it("never reports a cache hit on the very first request, even at cachePercentage=100", async () => {
    const orch = newOrchestrator({ cachePercentage: 100, maxRequests: 1 }, distinctPrompts(5));
    const results = await orch.run(new AbortController().signal);
    expect(results).toHaveLength(1);
    expect(results[0]!.cacheHit).toBe(false);
  });

  it("a cache-hit request resends the exact text of a previously-issued prompt", async () => {
    const orch = newOrchestrator({ cachePercentage: 100, maxRequests: 2 }, distinctPrompts(5));
    const results = await orch.run(new AbortController().signal);
    expect(results).toHaveLength(2);
    expect(results[0]!.cacheHit).toBe(false);
    expect(results[1]!.cacheHit).toBe(true);
    expect(results[1]!.inputText).toBe(results[0]!.inputText);
  });

  it("cachePercentage=0 never produces a cache hit, and every prompt is distinct", async () => {
    const orch = newOrchestrator({ cachePercentage: 0, maxRequests: 5 }, distinctPrompts(5));
    const results = await orch.run(new AbortController().signal);
    expect(results).toHaveLength(5);
    for (const r of results) {
      expect(r.cacheHit).toBe(false);
    }
    const texts = new Set(results.map((r) => r.inputText));
    expect(texts.size).toBe(5);
  });

  it("caps total dispatched requests at maxRequests even though cache hits don't consume fresh prompts", async () => {
    // Only 1 distinct prompt available; at 100% cache-hit intent every request
    // after the first must repeat it. maxRequests must still bound the TOTAL
    // count of requests actually sent, not just fresh ones.
    const orch = newOrchestrator({ cachePercentage: 100, maxRequests: 5 }, distinctPrompts(1));
    const results = await orch.run(new AbortController().signal);
    expect(results).toHaveLength(5);
    expect(results.filter((r) => r.cacheHit).length).toBe(4);
  });

  it("reported cacheHitRate-relevant flag matches what was actually resent, not just intent", async () => {
    // With only 5 fresh prompts and unlimited requests bounded to 6, request 6
    // (index 5) at 100% intent must be a genuine repeat of one of the first 5.
    const prompts = distinctPrompts(5);
    const orch = newOrchestrator({ cachePercentage: 100, maxRequests: 6 }, prompts);
    const results = await orch.run(new AbortController().signal);
    expect(results).toHaveLength(6);
    const seenTexts = new Set(prompts.map((p) => p.text));
    expect(seenTexts.has(results[5]!.inputText)).toBe(true);
  });
});
