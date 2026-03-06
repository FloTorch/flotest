import { parseCliArgs, resolveConfig } from "./src/cli/args.ts";
import { runInit } from "./src/cli/init.ts";
import { createGenerator } from "./src/generator/generator.ts";
import { createBackend } from "./src/runner/backend.ts";
import { ConcurrencyOrchestrator } from "./src/runner/orchestrator.ts";
import { WAL } from "./src/runner/wal.ts";
import { computeSummary } from "./src/reporter/aggregator.ts";
import { createExporters } from "./src/reporter/exporter.ts";
import { createAbortController } from "./src/utils/signal.ts";
import { ProgressDisplay } from "./src/cli/progress.ts";
import { bold, dim, green, red, cyan } from "./src/cli/ansi.ts";
import type { PromptRecord } from "./src/types/prompt.ts";
import type { SummaryMetrics, MetricAggregate } from "./src/types/metrics.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "./src/types/config.ts";

async function main() {
  const cliArgs = parseCliArgs(process.argv);

  if (cliArgs.command === "init") {
    await runInit(cliArgs.initOutputPath!);
    return;
  }

  const { command, configPath, runId, overrides } = cliArgs;
  const { config, outputDir } = resolveConfig(configPath, runId, overrides);

  switch (command) {
    case "run":
      await runFullPipeline(config, outputDir);
      break;
    case "generate":
      await runGenerate(config, outputDir);
      break;
    case "bench":
      await runBench(config, outputDir);
      break;
    case "report":
      await runReport(config);
      break;
  }
}

// ── Box-drawing helpers ──────────────────────────────────────────────

const BOX_W = 56;

function printBox(title: string, lines: string[]): void {
  const inner = BOX_W - 2;
  const titleStr = `── ${title} `;
  const topPad = "─".repeat(Math.max(0, inner - titleStr.length));
  console.log(`  ${dim("╭")}${dim(titleStr)}${dim(topPad)}${dim("╮")}`);
  for (const line of lines) {
    const stripped = stripAnsi(line);
    const pad = Math.max(0, inner - stripped.length - 2);
    console.log(`  ${dim("│")}  ${line}${" ".repeat(pad)}${dim("│")}`);
  }
  console.log(`  ${dim("╰")}${dim("─".repeat(inner))}${dim("╯")}`);
}

function stripAnsi(s: string): string {
  const ansiEscape = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
  return s.replace(ansiEscape, "");
}

// ── Banner ───────────────────────────────────────────────────────────

function printBanner(config: Config, outputDir: string): void {
  const inner = BOX_W - 2;
  const title = "FLOTorch Load Tester";
  const titlePad = Math.floor((inner - title.length) / 2);
  console.log();
  console.log(`  ${dim("╭")}${dim("─".repeat(inner))}${dim("╮")}`);
  console.log(
    `  ${dim("│")}${" ".repeat(titlePad)}${bold(title)}${" ".repeat(inner - titlePad - title.length)}${dim("│")}`,
  );
  console.log(`  ${dim("╰")}${dim("─".repeat(inner))}${dim("╯")}`);

  const maxReqs = config.benchmark.maxRequests;
  const maxDur = config.benchmark.maxDuration;
  const rows = [
    [dim("Model"), bold(config.provider.model)],
    [dim("Concurrency"), bold(String(config.benchmark.concurrency))],
    [dim("Streaming"), bold(config.benchmark.streaming ? "yes" : "no")],
  ];
  if (maxReqs) rows.push([dim("Requests"), bold(String(maxReqs))]);
  if (maxDur) rows.push([dim("Duration"), bold(`${maxDur}s`)]);
  rows.push([dim("Output"), cyan(outputDir)]);

  const labelW = 14;
  for (const [label, value] of rows) {
    const stripped = stripAnsi(label ?? "");
    const pad = " ".repeat(Math.max(0, labelW - stripped.length));
    console.log(`   ${label}${pad}${value}`);
  }
  console.log();
}

// ── Stage indicators ─────────────────────────────────────────────────

function stageOk(msg: string, detail?: string): void {
  const suffix = detail ? `    ${dim(detail)}` : "";
  console.log(`  ${green("✔")} ${msg}${suffix}`);
}

function stageRun(msg: string): void {
  console.log(`  ${bold("▸")} ${msg}`);
}

// ── Metric formatting ────────────────────────────────────────────────

function fmtNum(n: number, w: number): string {
  const s = n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(1);
  return s.padStart(w);
}

function fmtMetricTable(label: string, agg: MetricAggregate, labelW: number, colW: number): string {
  const l = label.padEnd(labelW);
  return (
    `${bold(l)}` +
    `${fmtNum(agg.mean, colW)}` +
    `${fmtNum(agg.p50, colW)}` +
    `${fmtNum(agg.p95, colW)}` +
    `${fmtNum(agg.p99, colW)}` +
    `${fmtNum(agg.max, colW)}`
  );
}

// ── printSummary ─────────────────────────────────────────────────────

function printSummary(summary: SummaryMetrics): void {
  const durationSec = (summary.endTime - summary.startTime) / 1000;
  const errColor = summary.failedRequests > 0 ? red : green;

  console.log();
  printBox("Summary", [
    `${dim("Duration")}       ${bold(durationSec.toFixed(1) + "s")}`,
    `${dim("Requests")}       ${bold(String(summary.successfulRequests))}/${summary.totalRequests} ${errColor(`(${summary.failedRequests} errors)`)}`,
    `${dim("Throughput")}     ${bold(summary.rpm.toFixed(1))} ${dim("req/min")}   ${bold(summary.overallTps.toFixed(1))} ${dim("tok/s")}`,
  ]);

  const labelW = 6;
  const colW = 9;
  const header =
    dim(" ".repeat(labelW)) +
    dim("mean".padStart(colW)) +
    dim("p50".padStart(colW)) +
    dim("p95".padStart(colW)) +
    dim("p99".padStart(colW)) +
    dim("max".padStart(colW));

  const latencyLines = [
    header,
    fmtMetricTable("TTFT", summary.ttft, labelW, colW),
    fmtMetricTable("E2E", summary.e2eLatency, labelW, colW),
    fmtMetricTable("ITL", summary.interTokenLatency, labelW, colW),
  ];

  console.log();
  printBox("Latency (ms)", latencyLines);

  if (Object.keys(summary.errorCodeFrequency).length > 0) {
    console.log();
    const errLines: string[] = [];
    for (const [code, count] of Object.entries(summary.errorCodeFrequency)) {
      errLines.push(`${red(code)}  ${bold(String(count))}`);
    }
    printBox("Errors", errLines);
  }

  if (Object.keys(summary.phaseBreakdown).length > 1) {
    console.log();
    const phaseLines: string[] = [];
    for (const [phase, data] of Object.entries(summary.phaseBreakdown)) {
      phaseLines.push(
        `${bold(phase.padEnd(12))} ${String(data.requests).padStart(4)} reqs   ${(data.errorRate * 100).toFixed(1)}% err`,
      );
    }
    printBox("Phases", phaseLines);
  }
}

// ── Commands ─────────────────────────────────────────────────────────

async function runFullPipeline(config: Config, outputDir: string): Promise<void> {
  printBanner(config, outputDir);

  // Stage 1: Generate prompts
  stageRun("Generating prompts...");
  const prompts = await generatePrompts(config);
  // Overwrite the "running" line with the "done" line
  process.stdout.write("\x1b[1A\x1b[2K");
  stageOk("Generating prompts", `${prompts.length} prompts`);

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    join(outputDir, "prompts.jsonl"),
    prompts.map((p) => JSON.stringify(p)).join("\n") + "\n",
  );

  // Stage 2: Run benchmark
  stageRun("Running benchmark...");
  const { controller, onShutdown } = createAbortController();
  const totalTarget = config.benchmark.maxRequests ?? Infinity;
  const progress = new ProgressDisplay({
    totalTarget,
    maxConcurrency: config.benchmark.concurrency,
    modelName: config.provider.model,
    streaming: config.benchmark.streaming,
  });
  progress.setStage("benchmarking");

  const backend = createBackend(config);
  const orchestrator = new ConcurrencyOrchestrator(
    config,
    backend,
    prompts,
    outputDir,
    (metrics, active, completed, phase, allowedConcurrency) =>
      progress.update(metrics, active, completed, phase, allowedConcurrency),
  );

  onShutdown(() => orchestrator.abort());
  await progress.start();

  const results = await orchestrator.run(controller.signal);
  progress.stop();

  stageOk("Running benchmark", `${results.length} requests`);

  // Stage 3: Report
  stageRun("Generating report...");
  const summary = computeSummary(results);
  const exporters = createExporters(config);

  for (const exporter of exporters) {
    await exporter.export(summary, results, outputDir);
  }

  process.stdout.write("\x1b[1A\x1b[2K");
  stageOk("Generating report");

  printSummary(summary);
  console.log(`\n  ${dim("Results saved to:")} ${cyan(outputDir)}\n`);
}

async function runGenerate(config: Config, outputDir: string): Promise<void> {
  printBanner(config, outputDir);
  stageRun("Generating prompts...");
  const prompts = await generatePrompts(config);

  mkdirSync(outputDir, { recursive: true });
  const outPath = join(outputDir, "prompts.jsonl");
  writeFileSync(outPath, prompts.map((p) => JSON.stringify(p)).join("\n") + "\n");
  process.stdout.write("\x1b[1A\x1b[2K");
  stageOk("Generating prompts", `${prompts.length} → ${cyan(outPath)}`);
}

async function runBench(config: Config, outputDir: string): Promise<void> {
  const inputFile = config.benchmark.inputFile;
  if (!inputFile) {
    throw new Error("bench command requires benchmark.inputFile (path to prompts.jsonl)");
  }

  printBanner(config, outputDir);
  stageRun(`Loading prompts from ${cyan(inputFile)}...`);
  const { FileGenerator } = await import("./src/generator/file.ts");
  const gen = new FileGenerator(inputFile);
  const count = config.benchmark.maxRequests ?? 100;
  const prompts = await gen.generate(count);
  process.stdout.write("\x1b[1A\x1b[2K");
  stageOk("Loading prompts", `${prompts.length} prompts`);

  stageRun("Running benchmark...");
  const { controller, onShutdown } = createAbortController();
  const progress = new ProgressDisplay({
    totalTarget: count,
    maxConcurrency: config.benchmark.concurrency,
    modelName: config.provider.model,
    streaming: config.benchmark.streaming,
  });
  progress.setStage("benchmarking");
  const backend = createBackend(config);
  const orchestrator = new ConcurrencyOrchestrator(
    config,
    backend,
    prompts,
    outputDir,
    (metrics, active, completed, phase, allowedConcurrency) =>
      progress.update(metrics, active, completed, phase, allowedConcurrency),
  );

  mkdirSync(outputDir, { recursive: true });
  onShutdown(() => orchestrator.abort());
  await progress.start();

  const results = await orchestrator.run(controller.signal);
  progress.stop();

  stageOk("Running benchmark", `${results.length} requests → ${cyan(outputDir)}`);
}

async function runReport(config: Config): Promise<void> {
  const inputDir = config.benchmark.inputFile;
  if (!inputDir) {
    throw new Error(
      "report command requires benchmark.inputFile (path to run output dir containing run_log.jsonl)",
    );
  }

  stageRun(`Reading results from ${cyan(inputDir)}...`);
  const results = WAL.readLog(inputDir);
  process.stdout.write("\x1b[1A\x1b[2K");
  stageOk("Reading results", `${results.length} entries`);

  stageRun("Computing report...");
  const summary = computeSummary(results);
  const exporters = createExporters(config);

  for (const exporter of exporters) {
    await exporter.export(summary, results, inputDir);
  }

  process.stdout.write("\x1b[1A\x1b[2K");
  stageOk("Computing report");

  printSummary(summary);
}

async function generatePrompts(config: Config): Promise<PromptRecord[]> {
  const generator = createGenerator(config);
  const count = config.benchmark.maxRequests ?? 100;
  return generator.generate(count);
}

main().catch((err) => {
  console.error(red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
