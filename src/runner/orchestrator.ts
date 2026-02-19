import type { Config } from "../types/config.ts";
import type { RequestMetrics, Phase } from "../types/metrics.ts";
import type { PromptRecord } from "../types/prompt.ts";
import type { IBackend } from "./backend.ts";
import { PhaseController } from "./phase.ts";
import { WAL } from "./wal.ts";
import { executeRequest } from "./request.ts";

export type ProgressCallback = (
  metrics: RequestMetrics,
  active: number,
  completed: number,
  phase: Phase,
  allowedConcurrency: number,
) => void;

export class ConcurrencyOrchestrator {
  private config: Config;
  private backend: IBackend;
  private prompts: PromptRecord[];
  private wal: WAL;
  private phaseController: PhaseController;
  private promptIndex = 0;
  private completedRequests = 0;
  private activeSlots = 0;
  private results: RequestMetrics[] = [];
  private aborted = false;
  private onProgress?: ProgressCallback;

  constructor(
    config: Config,
    backend: IBackend,
    prompts: PromptRecord[],
    outputDir: string,
    onProgress?: ProgressCallback,
  ) {
    this.config = config;
    this.backend = backend;
    this.prompts = prompts;
    this.wal = new WAL(outputDir);
    this.phaseController = new PhaseController(config);
    this.onProgress = onProgress;
  }

  abort(): void {
    this.aborted = true;
  }

  async run(signal: AbortSignal): Promise<RequestMetrics[]> {
    this.phaseController.start();
    const maxConcurrency = this.config.benchmark.concurrency;

    const workers = Array.from({ length: maxConcurrency }, (_, i) => this.workerLoop(i, signal));

    await Promise.allSettled(workers);
    return this.results;
  }

  private async workerLoop(slotId: number, signal: AbortSignal): Promise<void> {
    while (!this.phaseController.shouldStop(this.aborted || signal.aborted)) {
      // Gate: only proceed if this slot is allowed by phase controller
      if (slotId >= this.phaseController.allowedConcurrency) {
        await sleep(50);
        continue;
      }

      const prompt = this.getNextPrompt();
      if (!prompt) break;

      this.activeSlots++;
      const requestId = crypto.randomUUID();
      const phase = this.phaseController.phase;
      const cacheHit = this.isCacheHit();

      const metrics = await executeRequest(
        this.backend,
        prompt,
        this.config,
        requestId,
        phase,
        cacheHit,
        signal,
      );

      this.results.push(metrics);
      this.wal.write(metrics);
      this.completedRequests++;
      this.phaseController.recordCompletion();

      this.onProgress?.(
        metrics,
        this.activeSlots,
        this.completedRequests,
        this.phaseController.phase,
        this.phaseController.allowedConcurrency,
      );

      this.activeSlots--;
    }
  }

  private getNextPrompt(): PromptRecord | null {
    if (this.prompts.length === 0) return null;
    const maxReqs = this.config.benchmark.maxRequests ?? Infinity;
    if (this.promptIndex >= maxReqs) return null;
    const prompt = this.prompts[this.promptIndex % this.prompts.length]!;
    this.promptIndex++;
    return prompt;
  }

  private isCacheHit(): boolean {
    const pct = this.config.benchmark.cachePercentage;
    if (pct <= 0) return false;
    return Math.random() * 100 < pct;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
