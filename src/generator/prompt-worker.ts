import { parentPort, workerData } from "node:worker_threads";
import { countTokens } from "./tokenizer.ts";

interface WorkerInput {
  lines: string[];
  prompt: string;
  batches: Array<{ targetInput: number; targetOutput: number }>;
}

const { lines, prompt, batches } = workerData as WorkerInput;

const lineTokenCache = new Map<string, number>();

function lineTokenCount(line: string): number {
  let count = lineTokenCache.get(line);
  if (count === undefined) {
    count = countTokens(line);
    lineTokenCache.set(line, count);
  }
  return count;
}

const results = batches.map(({ targetInput, targetOutput }) => {
  const shuffled = [...lines].sort(() => Math.random() - 0.5);
  const parts: string[] = [];
  let estimatedTokens = 0;
  let lineIdx = 0;

  while (estimatedTokens < targetInput && lineIdx < shuffled.length) {
    const line = shuffled[lineIdx]!;
    const lt = lineTokenCount(line);
    if (estimatedTokens + lt > targetInput && parts.length > 0) break;
    parts.push(line);
    estimatedTokens += lt;
    lineIdx++;
  }

  while (estimatedTokens < targetInput) {
    const line = shuffled[lineIdx % shuffled.length]!;
    const lt = lineTokenCount(line);
    if (estimatedTokens + lt > targetInput * 1.1) break;
    parts.push(line);
    estimatedTokens += lt;
    lineIdx++;
  }

  const text = parts.join("\n");
  const header = `Randomly stream lines from the following text with ${targetOutput} output tokens. Don't generate eos tokens:\n`;
  const fullText = header + text + (prompt ? `\n${prompt}` : "");
  const finalTokens = countTokens(fullText);

  return { text: fullText, tokenCount: finalTokens, outputTokenTarget: targetOutput };
});

parentPort!.postMessage(results);
