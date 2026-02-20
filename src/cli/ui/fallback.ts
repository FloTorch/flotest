import type { BenchmarkStore } from "./store.ts";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m${s.toString().padStart(2, "0")}s` : `${s}s`;
}

export class FallbackDisplay {
  private store: BenchmarkStore;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(store: BenchmarkStore) {
    this.store = store;
  }

  start(): void {
    this.intervalId = setInterval(() => this.print(), 2000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.print();
  }

  private print(): void {
    const s = this.store;
    const elapsed = s.startTime > 0 ? (performance.now() - s.startTime) / 1000 : 0;
    const rps = elapsed > 0 ? s.completed / elapsed : 0;
    const tps = elapsed > 0 ? s.totalOutputTokens / elapsed : 0;
    const isInfinite = s.totalTarget === Infinity;
    const totalStr = isInfinite ? "?" : String(s.totalTarget);
    const pct = isInfinite ? 0 : Math.min(1, s.completed / s.totalTarget);
    const pctStr = isInfinite ? "" : ` (${(pct * 100).toFixed(1)}%)`;

    // ASCII progress bar
    const barWidth = 20;
    const filled = Math.round(pct * barWidth);
    const bar = "=".repeat(filled) + ".".repeat(barWidth - filled);

    process.stderr.write(
      `  [${bar}] ${s.completed}/${totalStr}${pctStr}\n` +
        `  ${formatDuration(elapsed)} | ${rps.toFixed(1)} req/s | ${tps.toFixed(0)} tok/s | ${s.errors} err | ${s.emptyResponses} empty\n`,
    );
  }
}
