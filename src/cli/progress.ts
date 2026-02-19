import type { Phase, RequestMetrics } from "../types/metrics.ts";
import { BenchmarkStore, type Stage } from "./ui/store.ts";
import { FallbackDisplay } from "./ui/fallback.ts";

interface ProgressDisplayOpts {
  totalTarget: number;
  maxConcurrency: number;
  modelName: string;
  streaming: boolean;
}

export class ProgressDisplay {
  readonly store: BenchmarkStore;
  private inkInstance: { unmount: () => void } | null = null;
  private fallback: FallbackDisplay | null = null;

  constructor(opts: ProgressDisplayOpts) {
    this.store = new BenchmarkStore(opts);
  }

  async start(): Promise<void> {
    this.store.setStartTime(performance.now());

    if (process.stderr.isTTY) {
      const { render } = await import("ink");
      const { createElement } = await import("react");
      const { App } = await import("./ui/app.tsx");
      this.inkInstance = render(createElement(App, { store: this.store }), {
        stdout: process.stderr,
        patchConsole: false,
        exitOnCtrlC: false,
      });
    } else {
      this.fallback = new FallbackDisplay(this.store);
      this.fallback.start();
    }
  }

  update(
    metrics: RequestMetrics,
    activeSlots: number,
    completed: number,
    phase: Phase,
    allowedConcurrency: number,
  ): void {
    this.store.update(metrics, activeSlots, completed, phase, allowedConcurrency);
  }

  setStage(stage: Stage): void {
    this.store.setStage(stage);
  }

  stop(): void {
    if (this.inkInstance) {
      this.inkInstance.unmount();
      this.inkInstance = null;
    }
    if (this.fallback) {
      this.fallback.stop();
      this.fallback = null;
    }
  }
}
