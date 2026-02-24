# FLOTorch Load Tester

LLM inference load testing and benchmarking tool. Measure TTFT, TPS, latency percentiles, and throughput of any OpenAI-compatible or SageMaker endpoint under sustained concurrent load.

## Features

- Single-command benchmarking with auto-generated synthetic prompts
- Accurate concurrency control with ramp-up/ramp-down phases
- Streaming and non-streaming support
- Comprehensive metrics: TTFT, TTFNT, TPS, RPM, ITL, E2E latency, percentiles (p25–p99)
- JSON and CSV report exports with per-request logs
- Cache-hit simulation for testing endpoint caching behavior
- OpenAI-compatible API and AWS SageMaker backends

## Installation

Requires **Node.js 18+**.

```bash
# npm
npm install -g @flotorch/loadtest

# pnpm
pnpm add -g @flotorch/loadtest

# yarn
yarn global add @flotorch/loadtest
```

After installation, the `flotorch-loadtest` command is available globally.

## Quick Start

### 1. Generate a config file

```bash
flotorch-loadtest init
```

This launches an interactive wizard that asks for:

- **Provider adapter** — `openai` or `sagemaker` (default: `openai`)
- **Model name** — the model identifier your endpoint expects
- **Base URL** — API endpoint (default: `https://api.openai.com/v1`)
- **Concurrency** — number of parallel requests (default: `10`)
- **Input tokens mean** — average input token count per request (default: `512`)
- **Output tokens mean** — average output token count per request (default: `256`)
- **Max requests** — total number of requests to send (default: `100`)
- **Streaming** — whether to stream responses (default: `y`)

Writes `config.json` to the current directory. You can specify a custom path:

```bash
flotorch-loadtest init my-test.json
```

### 2. Set credentials

**OpenAI / OpenAI-compatible:**

```bash
export OPENAI_API_KEY="sk-..."
```

**AWS SageMaker:**

The SageMaker backend reads standard AWS environment variables. At minimum, set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. Provide `AWS_SESSION_TOKEN` when using temporary credentials (e.g., `aws sts assume-role`).

```bash
export AWS_REGION="us-east-1"
export AWS_ACCESS_KEY_ID="AKIA..."
export AWS_SECRET_ACCESS_KEY="wJalr..."
# export AWS_SESSION_TOKEN="FwoGZX..."  # only for temporary/session credentials
```

Alternatively, configure credentials via `~/.aws/credentials` and set `AWS_REGION` (or `AWS_DEFAULT_REGION`).

### 3. Run the load test

```bash
flotorch-loadtest run -c config.json
```

This runs the full pipeline: **generate prompts → run benchmark → generate report**.

Results are saved to `./results/<run-id>/` containing:

| File                    | Description                                                        |
| ----------------------- | ------------------------------------------------------------------ |
| `summary.json`          | Aggregated metrics (latency, throughput, error rates, percentiles) |
| `run_log.jsonl`         | Per-request metrics streamed during the run                        |
| `prompts.jsonl`         | All generated prompts                                              |
| `individual_responses/` | Full response data for each request                                |
| `config.resolved.json`  | Final merged configuration used                                    |

## Commands

| Command       | Description                                            |
| ------------- | ------------------------------------------------------ |
| `run`         | Full pipeline: generate → bench → report **(default)** |
| `generate`    | Generate and save prompts only                         |
| `bench`       | Run benchmark using pre-generated prompts              |
| `report`      | Generate report from existing benchmark results        |
| `init [path]` | Interactively create a config file                     |

```bash
flotorch-loadtest run -c config.json        # full pipeline
flotorch-loadtest generate -c config.json   # prompts only
flotorch-loadtest bench -c config.json      # benchmark only
flotorch-loadtest report -c config.json     # report only
```

## CLI Options

Any config value can be overridden from the command line:

| Flag                  | Short | Description                                |
| --------------------- | ----- | ------------------------------------------ |
| `--config <path>`     | `-c`  | Path to config JSON (required)             |
| `--run-id <id>`       |       | Custom run ID (default: ISO timestamp)     |
| `--model <name>`      | `-m`  | Override `provider.model`                  |
| `--concurrency <n>`   | `-n`  | Override `benchmark.concurrency`           |
| `--max-requests <n>`  |       | Override `benchmark.maxRequests`           |
| `--max-duration <n>`  |       | Override `benchmark.maxDuration` (seconds) |
| `--output-dir <path>` | `-o`  | Override `benchmark.outputDir`             |
| `--base-url <url>`    |       | Override `provider.baseURL`                |
| `--streaming`         |       | Enable streaming                           |
| `--no-streaming`      |       | Disable streaming                          |

Example — override concurrency and model on the fly:

```bash
flotorch-loadtest run -c config.json -n 50 -m gpt-4o
```

## Configuration Reference

The config file is JSON with four sections:

```jsonc
{
  "provider": {
    "adapter": "openai", // "openai" | "sagemaker"
    "model": "gpt-4o", // model identifier (required)
    "baseURL": "https://api.openai.com/v1", // API endpoint
    "systemPrompt": "You are a helpful assistant.", // optional system message
    "config": {}, // backend-specific options
  },
  "benchmark": {
    "concurrency": 10, // parallel requests (required)
    "inputTokens": { "mean": 512, "stddev": 51 }, // input token distribution
    "outputTokens": { "mean": 256, "stddev": 26 }, // output token distribution
    "maxRequests": 100, // total requests (required if no maxDuration)
    "maxDuration": 60, // duration in seconds (required if no maxRequests)
    "timeout": 600, // per-request timeout in seconds (default: 600)
    "streaming": true, // stream responses (default: true)
    "cachePercentage": 0, // % of requests reusing previous prompts (0–100)
    "outputDir": "./results", // results directory (default: ./results)
    "inputFile": "prompts.jsonl", // pre-generated prompts (for bench command)
    "rampUp": {
      // optional: gradually increase concurrency
      "duration": 30, //   over N seconds, or
      "requests": 50, //   over N requests
    },
    "rampDown": {
      // optional: gradually decrease concurrency
      "duration": 15,
    },
  },
  "generator": {
    "enabled": false, // use synthetic prompt generator
    "prompt": "Custom instruction...", // optional custom prompt template
    "corpus": "./my-corpus.txt", // optional custom corpus file
  },
  "reporter": {
    "adapters": ["json", "csv"], // export formats (default: ["json"])
  },
}
```

> At least one of `maxRequests` or `maxDuration` is required. If `stddev` is omitted, it defaults to 10% of the mean.

### SageMaker `provider.config` options

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `requestFormat` | `"openai"` \| `"sagemaker"` | `"openai"` | Controls request body format. `"openai"` sends `messages` array (modern LMI/vLLM). `"sagemaker"` sends raw `inputs` string (legacy TGI). |

When `adapter` is `"sagemaker"`:

- `provider.model` is the **SageMaker endpoint name** (not a model ID).
- `provider.baseURL` overrides the default SageMaker runtime URL (`https://runtime.sagemaker.<region>.amazonaws.com`). Useful for VPC endpoints or custom domains.
- Streaming uses the `/endpoints/<model>/invocations-response-stream` path; non-streaming uses `/endpoints/<model>/invocations`.
- Requests are signed with AWS Signature V4 using the configured credentials.

## Metrics Collected

### Per-request

- **TTFT** — Time to first token (ms)
- **TTFNT** — Time to first non-thinking token (for reasoning models)
- **E2E Latency** — End-to-end request latency (ms)
- **Inter-token latencies** — Time between successive tokens (streaming)
- **Output throughput** — Tokens per second
- **Input/output token counts**
- **Phase** — ramp-up, steady, or ramp-down
- **Cache hit** — Whether the request was a cache hit
- **Error details** — Error message and code if failed

### Summary

- Success/failure counts and error rate
- RPM (requests per minute) and overall TPS (tokens per second)
- Percentiles (p25, p50, p75, p90, p95, p99) for all latency and throughput metrics
- Error code frequency breakdown
- Phase-level breakdown (requests and error rates per phase)
- Cache hit rate

## Examples

### Load test an OpenAI-compatible endpoint

```json
{
  "provider": {
    "adapter": "openai",
    "model": "gpt-4o",
    "baseURL": "https://api.openai.com/v1"
  },
  "benchmark": {
    "concurrency": 20,
    "inputTokens": { "mean": 256 },
    "outputTokens": { "mean": 128 },
    "maxRequests": 500,
    "streaming": true
  }
}
```

### Load test a self-hosted model (vLLM, Ollama, etc.)

```json
{
  "provider": {
    "adapter": "openai",
    "model": "meta-llama/Llama-3-8B",
    "baseURL": "http://localhost:8000/v1"
  },
  "benchmark": {
    "concurrency": 50,
    "inputTokens": { "mean": 512 },
    "outputTokens": { "mean": 256 },
    "maxDuration": 120,
    "streaming": true,
    "rampUp": { "duration": 30 },
    "rampDown": { "duration": 15 }
  }
}
```

### Load test an AWS SageMaker endpoint (LMI / vLLM container)

Modern SageMaker LMI and vLLM containers accept the Chat Completions `messages` format automatically — no extra configuration needed. Set `adapter` to `"sagemaker"` and use your **SageMaker endpoint name** as `model`.

```json
{
  "provider": {
    "adapter": "sagemaker",
    "model": "my-llama3-endpoint",
    "systemPrompt": "You are a helpful assistant."
  },
  "benchmark": {
    "concurrency": 20,
    "inputTokens": { "mean": 512 },
    "outputTokens": { "mean": 256 },
    "maxRequests": 200,
    "streaming": true
  }
}
```

```bash
# Set AWS credentials
export AWS_REGION="us-east-1"
export AWS_ACCESS_KEY_ID="AKIA..."
export AWS_SECRET_ACCESS_KEY="..."
# export AWS_SESSION_TOKEN="..."   # only needed for temporary credentials

flotorch-loadtest run -c config.json
```

The tool calls `https://runtime.sagemaker.<region>.amazonaws.com/endpoints/<model>/invocations-response-stream` for streaming or `.../invocations` for non-streaming, signing each request with AWS Signature V4.

### SageMaker with legacy request format (TGI / HuggingFace containers)

Older containers that don't support the `messages` field expect a raw text string via the `inputs` field. Set `requestFormat` to `"sagemaker"` in `provider.config`:

```json
{
  "provider": {
    "adapter": "sagemaker",
    "model": "my-tgi-endpoint",
    "config": {
      "requestFormat": "sagemaker"
    }
  },
  "benchmark": {
    "concurrency": 10,
    "inputTokens": { "mean": 256 },
    "outputTokens": { "mean": 128 },
    "maxRequests": 100,
    "streaming": false
  }
}
```

With the legacy format, the prompt is sent as `{ "inputs": "<prompt>", "parameters": { "max_new_tokens": N } }`. No chat template is applied — format your prompts accordingly.

### SageMaker with custom endpoint URL and ramp-up

If your SageMaker endpoint uses a custom domain or VPC endpoint, override `baseURL`:

```json
{
  "provider": {
    "adapter": "sagemaker",
    "model": "my-vllm-endpoint",
    "baseURL": "https://vpce-0123456789abcdef-ab12cd34.runtime.sagemaker.us-west-2.vpce.amazonaws.com"
  },
  "benchmark": {
    "concurrency": 50,
    "inputTokens": { "mean": 1024 },
    "outputTokens": { "mean": 512 },
    "maxRequests": 1000,
    "streaming": true,
    "rampUp": { "duration": 60 },
    "rampDown": { "duration": 30 }
  },
  "reporter": {
    "adapters": ["json", "csv"]
  }
}
```

### Time-bounded test with CSV output

```json
{
  "provider": {
    "adapter": "openai",
    "model": "gpt-4o-mini",
    "baseURL": "https://api.openai.com/v1"
  },
  "benchmark": {
    "concurrency": 10,
    "inputTokens": { "mean": 128 },
    "outputTokens": { "mean": 64 },
    "maxDuration": 300,
    "streaming": true
  },
  "reporter": {
    "adapters": ["json", "csv"]
  }
}
```

## License

MIT
