import { createInterface } from "node:readline/promises";
import { writeFileSync, existsSync } from "node:fs";

async function prompt(
  rl: ReturnType<typeof createInterface>,
  question: string,
  defaultValue?: string,
): Promise<string> {
  const suffix = defaultValue != null ? ` (${defaultValue})` : "";
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  return answer || defaultValue || "";
}

export async function runInit(outputPath: string): Promise<void> {
  if (existsSync(outputPath)) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const overwrite = await prompt(rl, `${outputPath} already exists. Overwrite? [y/N]`, "n");
    if (overwrite.toLowerCase() !== "y") {
      rl.close();
      console.log("Aborted.");
      return;
    }
    rl.close();
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log("\nFLOTorch Load Tester — Config Generator\n");

  // Provider
  const adapter = await prompt(rl, "Provider adapter [openai/sagemaker]", "openai");
  const model = await prompt(rl, "Model name (required)");
  if (!model) {
    rl.close();
    throw new Error("Model name is required");
  }

  let baseURL: string | undefined;
  if (adapter === "openai") {
    const url = await prompt(rl, "Base URL", "https://api.openai.com/v1");
    if (url !== "https://api.openai.com/v1") {
      baseURL = url;
    }
  }

  // Benchmark
  const concurrency = Number(await prompt(rl, "Concurrency", "10"));
  const inputMean = Number(await prompt(rl, "Input tokens mean", "512"));
  const outputMean = Number(await prompt(rl, "Output tokens mean", "256"));
  const maxRequests = Number(await prompt(rl, "Max requests", "100"));
  const streamingAnswer = await prompt(rl, "Streaming? [y/n]", "y");
  const streaming = streamingAnswer.toLowerCase() === "y";

  rl.close();

  const config = {
    provider: {
      adapter,
      model,
      ...(baseURL && { baseURL }),
    },
    benchmark: {
      concurrency,
      inputTokens: { mean: inputMean },
      outputTokens: { mean: outputMean },
      maxRequests,
      streaming,
      outputDir: "./results",
      timeout: 600,
      cachePercentage: 0,
    },
    generator: {
      enabled: false,
    },
    reporter: {
      adapters: ["json"],
    },
  };

  writeFileSync(outputPath, JSON.stringify(config, null, 2) + "\n");
  console.log(`\nConfig written to ${outputPath}`);
}
