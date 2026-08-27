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

// How many of the most recently *freshly-issued* prompts are kept around to
// resend verbatim for a "cache hit" request. Bounded so memory/behavior stays
// predictable on long runs rather than accumulating every prompt ever sent.
const RECENT_PROMPT_POOL_SIZE = 20;

export class ConcurrencyOrchestrator {
  private config: Config;
  private backend: IBackend;
  private prompts: PromptRecord[];
  private wal: WAL;
  private phaseController: PhaseController;
  private promptIndex = 0;
  private dispatchedCount = 0;
  private completedRequests = 0;
  private activeSlots = 0;
  private results: RequestMetrics[] = [];
  private aborted = false;
  private onProgress?: ProgressCallback;
  // Verbatim text of prompts already sent, so a "cache hit" request can resend
  // an EXACT previous prompt — giving vLLM's (or any backend's) prefix cache a
  // real, full-length match to find. Previously `cachePercentage` only flipped
  // a random label on the request metrics; it never changed what was actually
  // sent, so every request was distinct content and the real cache hit rate
  // was always 0% regardless of the configured percentage.
  private recentPrompts: PromptRecord[] = [];

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

      const wantsCacheHit = this.isCacheHit();
      const picked = this.getNextPrompt(wantsCacheHit);
      if (!picked) break;
      const { prompt, cacheHit } = picked;

      this.activeSlots++;
      const requestId = crypto.randomUUID();
      const phase = this.phaseController.phase;

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

  /**
   * Picks the prompt for the next request.
   *
   * `wantsCacheHit` is the random intent from `isCacheHit()`; the returned
   * `cacheHit` reflects what ACTUALLY happened, which can differ from intent
   * when there's no prior prompt yet to repeat (e.g. the very first request
   * on this slot) — in that case we fall through to a fresh prompt rather
   * than report a cache hit that never occurred. Callers must use the
   * returned `cacheHit`, not `wantsCacheHit`, when recording metrics.
   *
   * `dispatchedCount` (not `promptIndex`) gates `maxRequests`: a cache-hit
   * request resends a prompt without consuming a new slot in the fresh pool,
   * so `promptIndex` alone would no longer count total dispatched requests.
   */
  private getNextPrompt(wantsCacheHit: boolean): { prompt: PromptRecord; cacheHit: boolean } | null {
    const maxReqs = this.config.benchmark.maxRequests ?? Infinity;
    if (this.dispatchedCount >= maxReqs) return null;

    if (wantsCacheHit && this.recentPrompts.length > 0) {
      const idx = Math.floor(Math.random() * this.recentPrompts.length);
      this.dispatchedCount++;
      return { prompt: this.recentPrompts[idx]!, cacheHit: true };
    }

    if (this.prompts.length === 0) return null;
    const prompt = this.prompts[this.promptIndex % this.prompts.length]!;
    this.promptIndex++;
    this.dispatchedCount++;
    this.recentPrompts.push(prompt);
    if (this.recentPrompts.length > RECENT_PROMPT_POOL_SIZE) {
      this.recentPrompts.shift();
    }
    return { prompt, cacheHit: false };
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
