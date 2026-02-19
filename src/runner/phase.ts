import type { Phase } from "../types/metrics.ts";
import type { Config } from "../types/config.ts";

export class PhaseController {
  private maxConcurrency: number;
  private rampUpRequests: number;
  private rampUpDuration: number;
  private rampDownRequests: number;
  private rampDownDuration: number;
  private startTime = 0;
  private completedRequests = 0;
  private totalRequests: number;
  private maxDuration: number;

  constructor(config: Config) {
    this.maxConcurrency = config.benchmark.concurrency;
    this.rampUpRequests = config.benchmark.rampUp?.requests ?? 0;
    this.rampUpDuration = (config.benchmark.rampUp?.duration ?? 0) * 1000;
    this.rampDownRequests = config.benchmark.rampDown?.requests ?? 0;
    this.rampDownDuration = (config.benchmark.rampDown?.duration ?? 0) * 1000;
    this.totalRequests = config.benchmark.maxRequests ?? Infinity;
    this.maxDuration = (config.benchmark.maxDuration ?? Infinity) * 1000;
  }

  start(): void {
    this.startTime = performance.now();
  }

  recordCompletion(): void {
    this.completedRequests++;
  }

  get phase(): Phase {
    const elapsed = performance.now() - this.startTime;
    const remaining = this.totalRequests - this.completedRequests;

    if (this.rampUpDuration > 0 && elapsed < this.rampUpDuration) {
      return "ramp-up";
    }
    if (this.rampUpRequests > 0 && this.completedRequests < this.rampUpRequests) {
      return "ramp-up";
    }

    if (this.rampDownDuration > 0) {
      const timeUntilEnd = this.maxDuration - elapsed;
      if (timeUntilEnd <= this.rampDownDuration) return "ramp-down";
    }
    if (this.rampDownRequests > 0 && remaining <= this.rampDownRequests) {
      return "ramp-down";
    }

    return "steady";
  }

  get allowedConcurrency(): number {
    const currentPhase = this.phase;
    const elapsed = performance.now() - this.startTime;

    if (currentPhase === "ramp-up") {
      let progress: number;
      if (this.rampUpDuration > 0) {
        progress = Math.min(1, elapsed / this.rampUpDuration);
      } else {
        progress = Math.min(1, this.completedRequests / this.rampUpRequests);
      }
      return Math.max(1, Math.ceil(progress * this.maxConcurrency));
    }

    if (currentPhase === "ramp-down") {
      let progress: number;
      if (this.rampDownDuration > 0) {
        const timeUntilEnd = this.maxDuration - elapsed;
        progress = Math.max(0, timeUntilEnd / this.rampDownDuration);
      } else {
        const remaining = this.totalRequests - this.completedRequests;
        progress = Math.max(0, remaining / this.rampDownRequests);
      }
      return Math.max(1, Math.ceil(progress * this.maxConcurrency));
    }

    return this.maxConcurrency;
  }

  shouldStop(aborted: boolean): boolean {
    if (aborted) return true;
    if (this.completedRequests >= this.totalRequests) return true;
    const elapsed = performance.now() - this.startTime;
    if (elapsed >= this.maxDuration) return true;
    return false;
  }
}
