import type { Phase, RequestMetrics } from "../../types/metrics.ts";

export type Stage = "generating" | "benchmarking" | "reporting" | "idle";

const ROLLING_CAP = 50;

export interface StoreSnapshot {
  phase: Phase;
  stage: Stage;
  activeSlots: number;
  allowedConcurrency: number;
  maxConcurrency: number;
  completed: number;
  totalTarget: number;
  errors: number;
  totalOutputTokens: number;
  totalInputTokens: number;
  startTime: number;
  recentTtft: number[];
  recentE2eLatency: number[];
  recentErrors: string[];
  modelName: string;
  streaming: boolean;
}

export class BenchmarkStore {
  phase: Phase = "steady";
  stage: Stage = "idle";
  activeSlots = 0;
  allowedConcurrency = 0;
  maxConcurrency: number;
  completed = 0;
  totalTarget: number;
  errors = 0;
  totalOutputTokens = 0;
  totalInputTokens = 0;
  startTime = 0;
  recentTtft: number[] = [];
  recentE2eLatency: number[] = [];
  recentErrors: string[] = [];
  modelName: string;
  streaming: boolean;

  constructor(opts: {
    totalTarget: number;
    maxConcurrency: number;
    modelName: string;
    streaming: boolean;
  }) {
    this.totalTarget = opts.totalTarget;
    this.maxConcurrency = opts.maxConcurrency;
    this.modelName = opts.modelName;
    this.streaming = opts.streaming;
  }

  update(
    metrics: RequestMetrics,
    activeSlots: number,
    completed: number,
    phase: Phase,
    allowedConcurrency: number,
  ): void {
    this.activeSlots = activeSlots;
    this.completed = completed;
    this.phase = phase;
    this.allowedConcurrency = allowedConcurrency;
    this.totalOutputTokens += metrics.outputTokens;
    this.totalInputTokens += metrics.inputTokens;

    if (metrics.error) {
      this.errors++;
      if (this.recentErrors.length >= 5) this.recentErrors.shift();
      this.recentErrors.push(metrics.error);
    }

    if (!metrics.error) {
      if (this.recentTtft.length >= ROLLING_CAP) this.recentTtft.shift();
      this.recentTtft.push(metrics.ttftMs);

      if (this.recentE2eLatency.length >= ROLLING_CAP) this.recentE2eLatency.shift();
      this.recentE2eLatency.push(metrics.e2eLatencyMs);
    }
  }

  setStage(stage: Stage): void {
    this.stage = stage;
  }

  setStartTime(t: number): void {
    this.startTime = t;
  }

  snapshot(): StoreSnapshot {
    return {
      phase: this.phase,
      stage: this.stage,
      activeSlots: this.activeSlots,
      allowedConcurrency: this.allowedConcurrency,
      maxConcurrency: this.maxConcurrency,
      completed: this.completed,
      totalTarget: this.totalTarget,
      errors: this.errors,
      totalOutputTokens: this.totalOutputTokens,
      totalInputTokens: this.totalInputTokens,
      startTime: this.startTime,
      recentTtft: [...this.recentTtft],
      recentE2eLatency: [...this.recentE2eLatency],
      recentErrors: [...this.recentErrors],
      modelName: this.modelName,
      streaming: this.streaming,
    };
  }
}
