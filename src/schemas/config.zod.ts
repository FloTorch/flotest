import { z } from "zod";

const rampSchema = z
  .object({
    requests: z.number().optional(),
    duration: z.number().optional(),
  })
  .refine((d) => d.requests || d.duration, {
    message: "At least one of requests or duration required",
  });

export const ConfigSchema = z.object({
  generator: z
    .object({
      enabled: z.boolean().default(false),
      prompt: z.string().optional(),
      corpus: z.string().optional(),
    })
    .default(() => ({ enabled: false })),
  benchmark: z
    .object({
      inputFile: z.string().optional(),
      outputDir: z.string().default("./results"),
      inputTokens: z.object({
        mean: z.number(),
        stddev: z.number().optional(),
      }),
      outputTokens: z.object({
        mean: z.number(),
        stddev: z.number().optional(),
      }),
      maxRequests: z.number().optional(),
      maxDuration: z.number().optional(),
      timeout: z.number().default(600),
      concurrency: z.number(),
      rampUp: rampSchema.optional(),
      rampDown: rampSchema.optional(),
      cachePercentage: z.number().min(0).max(100).default(0),
      streaming: z.boolean().default(true),
    })
    .refine((d) => d.maxRequests || d.maxDuration, {
      message: "At least one of maxRequests or maxDuration required",
    }),
  provider: z.object({
    adapter: z.enum(["openai", "sagemaker"]).default("openai"),
    model: z.string(),
    baseURL: z.string().optional(),
    systemPrompt: z.string().optional(),
    config: z.record(z.string(), z.any()).optional(),
  }),
  reporter: z
    .object({
      adapters: z.array(z.enum(["json", "csv"])).default(["json"]),
    })
    .default(() => ({ adapters: ["json" as const] })),
});

export type Config = z.infer<typeof ConfigSchema>;

export function validateEnv<T extends z.ZodType>(schema: T, adapterName: string): z.infer<T> {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Missing/invalid env vars for "${adapterName}" backend:\n${errors}`);
  }
  return result.data;
}
