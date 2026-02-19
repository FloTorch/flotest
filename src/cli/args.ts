import { parseArgs } from "node:util";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ConfigSchema } from "../schemas/config.zod.ts";
import { bold, dim, cyan, yellow } from "./ansi.ts";
import type { Config } from "../types/config.ts";

declare const __PKG_VERSION__: string;
const VERSION = typeof __PKG_VERSION__ !== "undefined" ? __PKG_VERSION__ : "dev";

export type Command = "run" | "generate" | "bench" | "report" | "init";

export interface RawArgs {
  command: Command;
  configPath: string;
  runId: string;
  overrides: Record<string, unknown>;
  initOutputPath?: string;
}

export interface ResolvedConfig {
  config: Config;
  outputDir: string;
}

const VALID_COMMANDS = new Set<Command>(["run", "generate", "bench", "report", "init"]);

const HELP_TEXT = `
${bold("FLOTorch Load Tester")} ${dim(`v${VERSION}`)}

${yellow("USAGE")}
  flotorch ${dim("<command>")} ${dim("[options]")}

${yellow("COMMANDS")}
  ${cyan("run")}          ${dim("Run full pipeline: generate → bench → report (default)")}
  ${cyan("generate")}     ${dim("Generate prompts only")}
  ${cyan("bench")}        ${dim("Run benchmark using existing prompts")}
  ${cyan("report")}       ${dim("Generate report from existing results")}
  ${cyan("init")} ${dim("[path]")}  ${dim("Interactively create a config file (default: config.json)")}

${yellow("OPTIONS")}
  ${cyan("-c, --config")} ${dim("<path>")}   Path to config JSON ${dim("(required for run/generate/bench/report)")}
  ${cyan("--run-id")} ${dim("<id>")}         Custom run ID ${dim("(default: ISO timestamp)")}
  ${cyan("-m, --model")} ${dim("<name>")}    Override provider.model
  ${cyan("-n, --concurrency")} ${dim("<n>")} Override benchmark.concurrency
  ${cyan("--max-requests")} ${dim("<n>")}    Override benchmark.maxRequests
  ${cyan("--max-duration")} ${dim("<n>")}    Override benchmark.maxDuration ${dim("(seconds)")}
  ${cyan("-o, --output-dir")} ${dim("<p>")}  Override benchmark.outputDir
  ${cyan("--base-url")} ${dim("<url>")}      Override provider.baseURL
  ${cyan("--streaming")}           Enable streaming
  ${cyan("--no-streaming")}        Disable streaming
  ${cyan("-v, --version")}         Show version number
  ${cyan("-h, --help")}            Show this help message
`.trimStart();

export function parseCliArgs(argv: string[]): RawArgs {
  const args = argv.slice(2);
  let command: Command = "run";

  if (args.length > 0 && VALID_COMMANDS.has(args[0] as Command)) {
    command = args.shift()! as Command;
  }

  const { values, positionals } = parseArgs({
    args,
    options: {
      config: { type: "string", short: "c" },
      "run-id": { type: "string" },
      model: { type: "string", short: "m" },
      concurrency: { type: "string", short: "n" },
      "max-requests": { type: "string" },
      "max-duration": { type: "string" },
      "output-dir": { type: "string", short: "o" },
      "base-url": { type: "string" },
      streaming: { type: "boolean" },
      "no-streaming": { type: "boolean" },
      version: { type: "boolean", short: "v" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.version) {
    console.log(VERSION);
    process.exit(0);
  }

  if (values.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  if (command === "init") {
    const initOutputPath = positionals[0] ?? "config.json";
    return { command, configPath: "", runId: "", overrides: {}, initOutputPath };
  }

  const configPath = values.config;
  if (!configPath) {
    throw new Error("--config / -c is required");
  }

  const runId = values["run-id"] ?? new Date().toISOString().replace(/[:.]/g, "-");

  const overrides = collectOverrides(values);

  return { command, configPath, runId, overrides };
}

export function resolveConfig(
  configPath: string,
  runId: string,
  cliOverrides: Record<string, unknown>,
): ResolvedConfig {
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }
  const rawConfig = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;

  // Determine output dir from raw config (before merge, to locate experiment folder)
  const benchRaw = (rawConfig.benchmark as Record<string, unknown>) ?? {};
  const baseOutputDir = (benchRaw.outputDir as string) ?? "./results";
  const outputDir = join(baseOutputDir, runId);

  // Load saved overrides if they exist
  const savedOverrides = loadSavedOverrides(outputDir);

  // 3-way merge: config ← saved overrides ← CLI overrides
  const merged = deepMerge(rawConfig, savedOverrides, cliOverrides);

  // Persist the combined overrides (saved + CLI)
  const combinedOverrides = deepMerge(savedOverrides, cliOverrides);
  mkdirSync(outputDir, { recursive: true });
  saveOverrides(outputDir, combinedOverrides);

  // Validate
  const result = ConfigSchema.safeParse(merged);
  if (!result.success) {
    const errors = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid configuration:\n${errors}`);
  }

  // Save fully resolved config
  writeFileSync(
    join(outputDir, "config.resolved.json"),
    JSON.stringify(result.data, null, 2) + "\n",
  );

  return { config: result.data as Config, outputDir };
}

function collectOverrides(
  values: Record<string, string | boolean | undefined>,
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};
  const benchmark: Record<string, unknown> = {};
  const provider: Record<string, unknown> = {};

  if (values.model) provider.model = values.model;
  if (values["base-url"]) provider.baseURL = values["base-url"];
  if (values.concurrency) benchmark.concurrency = Number(values.concurrency);
  if (values["max-requests"]) benchmark.maxRequests = Number(values["max-requests"]);
  if (values["max-duration"]) benchmark.maxDuration = Number(values["max-duration"]);
  if (values["output-dir"]) benchmark.outputDir = values["output-dir"];
  if (values.streaming === true) benchmark.streaming = true;
  if (values["no-streaming"] === true) benchmark.streaming = false;

  if (Object.keys(provider).length > 0) overrides.provider = provider;
  if (Object.keys(benchmark).length > 0) overrides.benchmark = benchmark;

  return overrides;
}

function loadSavedOverrides(outputDir: string): Record<string, unknown> {
  const path = join(outputDir, "overrides.json");
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
}

function saveOverrides(outputDir: string, overrides: Record<string, unknown>): void {
  if (Object.keys(overrides).length === 0) return;
  writeFileSync(join(outputDir, "overrides.json"), JSON.stringify(overrides, null, 2) + "\n");
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

export function deepMerge(...sources: Record<string, unknown>[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const source of sources) {
    for (const key of Object.keys(source)) {
      if (isPlainObject(result[key]) && isPlainObject(source[key])) {
        result[key] = deepMerge(
          result[key] as Record<string, unknown>,
          source[key] as Record<string, unknown>,
        );
      } else {
        result[key] = source[key];
      }
    }
  }
  return result;
}
