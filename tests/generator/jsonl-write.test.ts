import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, openSync, writeSync, closeSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { PromptRecord } from "../../src/types/prompt.ts";

const tmpDir = join(import.meta.dirname, ".tmp-test-output");

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writePromptsJsonl(prompts: PromptRecord[], outPath: string): void {
  const fd = openSync(outPath, "w");
  for (const p of prompts) {
    writeSync(fd, JSON.stringify(p) + "\n");
  }
  closeSync(fd);
}

function readPromptsJsonl(path: string): PromptRecord[] {
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l));
}

describe("JSONL prompt writing", () => {
  it("writes and reads back small prompt set correctly", () => {
    mkdirSync(tmpDir, { recursive: true });
    const outPath = join(tmpDir, "prompts.jsonl");

    const prompts: PromptRecord[] = [
      { text: "hello world", tokenCount: 2, outputTokenTarget: 10 },
      { text: "foo bar baz", tokenCount: 3, outputTokenTarget: 20 },
    ];

    writePromptsJsonl(prompts, outPath);
    const read = readPromptsJsonl(outPath);

    expect(read).toHaveLength(2);
    expect(read[0]).toEqual(prompts[0]);
    expect(read[1]).toEqual(prompts[1]);
  });

  it("handles large prompt sets without string length error", () => {
    mkdirSync(tmpDir, { recursive: true });
    const outPath = join(tmpDir, "prompts.jsonl");

    // Generate 500 prompts with ~50k chars each (~25MB total)
    const bigText = "x".repeat(50_000);
    const prompts: PromptRecord[] = Array.from({ length: 500 }, (_, i) => ({
      text: bigText,
      tokenCount: 50000,
      outputTokenTarget: 100 + i,
    }));

    writePromptsJsonl(prompts, outPath);
    const read = readPromptsJsonl(outPath);

    expect(read).toHaveLength(500);
    expect(read[0].text).toHaveLength(50_000);
    expect(read[499].outputTokenTarget).toBe(599);
  });

  it("preserves special characters and unicode", () => {
    mkdirSync(tmpDir, { recursive: true });
    const outPath = join(tmpDir, "prompts.jsonl");

    const prompts: PromptRecord[] = [
      { text: 'line with "quotes" and\nnewlines', tokenCount: 5, outputTokenTarget: 10 },
      { text: "unicode: 日本語 émojis 🎉", tokenCount: 8, outputTokenTarget: 15 },
    ];

    writePromptsJsonl(prompts, outPath);
    const read = readPromptsJsonl(outPath);

    expect(read).toHaveLength(2);
    expect(read[0].text).toBe('line with "quotes" and\nnewlines');
    expect(read[1].text).toBe("unicode: 日本語 émojis 🎉");
  });
});
