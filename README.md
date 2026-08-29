# FloTest

FloTest is a load testing and benchmarking tool for large language model (LLM) inference endpoints. It sends synthetic prompts to an OpenAI-compatible or Amazon SageMaker endpoint under sustained concurrent load and reports time to first token (TTFT), tokens per second (TPS), latency percentiles, and throughput.

## Features

- **One command for the full pipeline.** `flotest run` generates prompts, runs the benchmark, and writes the report.
- **Synthetic prompt generation.** FloTest builds prompts to a target token count from a built-in corpus or a corpus that you supply. For more than 10 prompts, generation runs in parallel across worker threads.
- **Accurate concurrency control.** FloTest holds a fixed number of in-flight requests and supports ramp-up and ramp-down phases.
- **Keep-alive connection pool.** All requests share a configurable connection pool, so requests under sustained load reuse TCP connections instead of opening new ones.
- **Genuine cache-hit simulation.** With `cachePercentage` set, FloTest resends the exact text of a recent prompt so that the endpoint's prefix cache receives a real repeat.
- **Streaming and non-streaming requests.**
- **Per-request and summary metrics.** TTFT, time to first non-thinking token (TTFNT), inter-token latency (ITL), end-to-end latency, TPS, requests per minute (RPM), empty-response count, and percentiles from p25 to p99.
- **JSON and CSV reports** with per-request logs and full response bodies.
- **Two backends.** OpenAI-compatible APIs and Amazon SageMaker runtime endpoints.

## Install

FloTest requires Node.js 22.19 or later.

```bash
# npm
npm install -g @flotorch/flotest

# pnpm
pnpm add -g @flotorch/flotest

# yarn
yarn global add @flotorch/flotest
```

After installation, the `flotest` command is available on your `PATH`.

## Get started

### Create a config file

To create a config file interactively, run the following command:

```bash
flotest init
```

The wizard asks for the following values:

| Prompt             | Description                                        | Default                     |
| ------------------ | -------------------------------------------------- | --------------------------- |
| Provider adapter   | `openai` or `sagemaker`                            | `openai`                    |
| Model name         | The model identifier that your endpoint expects    | none                        |
| Base URL           | The API endpoint                                   | `https://api.openai.com/v1` |
| Concurrency        | Number of parallel requests                        | `10`                        |
| Input tokens mean  | Average input token count for each request         | `512`                       |
| Output tokens mean | Average output token count for each request        | `256`                       |
| Max requests       | Total number of requests to send                   | `100`                       |
| Streaming          | Whether to stream responses                        | `y`                         |

The wizard writes `config.json` to the current directory. To write to a different path, pass the path as an argument:

```bash
flotest init my-test.json
```

### Set credentials

**OpenAI-compatible endpoints:**

```bash
export OPENAI_API_KEY="sk-..."
```

**Amazon SageMaker endpoints:**

The SageMaker backend reads the standard AWS environment variables. At minimum, set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. If you use temporary credentials, for example from `aws sts assume-role`, also set `AWS_SESSION_TOKEN`.

```bash
export AWS_REGION="us-east-1"
export AWS_ACCESS_KEY_ID="AKIA..."
export AWS_SECRET_ACCESS_KEY="wJalr..."
# export AWS_SESSION_TOKEN="FwoGZX..."  # temporary credentials only
```

You can also store credentials in `~/.aws/credentials` and set `AWS_REGION` or `AWS_DEFAULT_REGION`.

### Run the load test

```bash
flotest run -c config.json
```

The `run` command generates prompts, runs the benchmark, and then writes the report.

FloTest saves results to `./results/<run-id>/`:

| File                    | Description                                                              |
| ----------------------- | ------------------------------------------------------------------------ |
| `summary.json`          | Aggregated metrics: latency, throughput, error rates, and percentiles   |
| `run_log.jsonl`         | Per-request metrics, written as each request completes                   |
| `prompts.jsonl`         | All generated prompts                                                    |
| `individual_responses/` | The full response for each request                                       |
| `config.resolved.json`  | The final merged configuration that the run used                         |
| `overrides.json`        | Command-line overrides that were applied, if any                         |

## Commands

| Command       | Description                                                   |
| ------------- | ------------------------------------------------------------- |
| `run`         | Generate prompts, run the benchmark, and write the report. This is the default command. |
| `generate`    | Generate prompts and save them to `prompts.jsonl`.            |
| `bench`       | Run the benchmark with prompts that you generated earlier.    |
| `report`      | Write a report from an existing `run_log.jsonl`.              |
| `init [path]` | Create a config file interactively.                           |

```bash
flotest run -c config.json        # full pipeline
flotest generate -c config.json   # prompts only
flotest bench -c config.json      # benchmark only
flotest report -c config.json     # report only
```

The `bench` command requires `benchmark.inputFile` to point to a `prompts.jsonl` file. The `report` command requires `benchmark.inputFile` to point to a run output directory that contains `run_log.jsonl`.

## Command-line options

You can override config values from the command line:

| Flag                  | Short | Description                                    |
| --------------------- | ----- | ---------------------------------------------- |
| `--config <path>`     | `-c`  | Path to the config JSON file. Required.        |
| `--run-id <id>`       |       | Custom run ID. Defaults to an ISO timestamp.   |
| `--model <name>`      | `-m`  | Overrides `provider.model`.                    |
| `--concurrency <n>`   | `-n`  | Overrides `benchmark.concurrency`.             |
| `--max-requests <n>`  |       | Overrides `benchmark.maxRequests`.             |
| `--max-duration <n>`  |       | Overrides `benchmark.maxDuration`, in seconds. |
| `--output-dir <path>` | `-o`  | Overrides `benchmark.outputDir`.               |
| `--base-url <url>`    |       | Overrides `provider.baseURL`.                  |
| `--streaming`         |       | Enables streaming.                             |
| `--no-streaming`      |       | Disables streaming.                            |
| `--version`           | `-v`  | Prints the version number.                     |
| `--help`              | `-h`  | Prints the help text.                          |

The following example overrides concurrency and model:

```bash
flotest run -c config.json -n 50 -m gpt-4o
```

FloTest saves overrides to `overrides.json` in the run directory. If you run a later command with the same `--run-id`, FloTest applies the saved overrides again, and then applies any new command-line overrides on top of them.

## Configuration reference

The config file is a JSON document with five sections:

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
    "maxRequests": 100, // total requests (required if maxDuration is not set)
    "maxDuration": 60, // duration in seconds (required if maxRequests is not set)
    "timeout": 600, // per-request timeout in seconds (default: 600)
    "streaming": true, // stream responses (default: true)
    "cachePercentage": 0, // percentage of requests that resend a recent prompt (0–100)
    "outputDir": "./results", // results directory (default: ./results)
    "inputFile": "prompts.jsonl", // input for the bench and report commands
    "rampUp": {
      // optional: increase concurrency gradually
      "duration": 30, //   over N seconds, or
      "requests": 50, //   over N requests
    },
    "rampDown": {
      // optional: decrease concurrency gradually
      "duration": 15,
    },
  },
  "generator": {
    "enabled": false, // use the synthetic prompt generator
    "prompt": "Custom instruction...", // optional instruction prepended to each prompt
    "corpus": "./my-corpus.txt", // optional custom corpus file
  },
  "http": {
    // optional: keep-alive connection pool shared by all requests
    "maxConnections": 10, // pool size per host (default: benchmark.concurrency)
    "keepAliveTimeout": 60, // seconds that an idle connection stays open (default: 60)
    "connectTimeout": 10, // seconds to wait for a TCP connection (default: 10)
  },
  "reporter": {
    "adapters": ["json", "csv"], // export formats (default: ["json"])
  },
}
```

You must set at least one of `maxRequests` or `maxDuration`. If you omit `stddev`, FloTest uses 10% of the mean.

### HTTP connection pool

All requests from both backends go through one keep-alive connection pool. The pool prevents a problem that occurs with the default Node.js `fetch` behavior, where idle sockets close after 4 seconds and every replacement request under sustained load opens a new TCP connection. On a slow path, such as an SSH tunnel, that connection setup can exceed the request timeout and fail with the message `fetch failed`.

| Key                | Type   | Default                 | Description                                                                                   |
| ------------------ | ------ | ----------------------- | --------------------------------------------------------------------------------------------- |
| `maxConnections`   | number | `benchmark.concurrency` | Maximum open connections per host. The default matches concurrency so that the pool never limits the measured concurrency. |
| `keepAliveTimeout` | number | `60`                    | Seconds that an idle connection stays open before the pool closes it.                        |
| `connectTimeout`   | number | `10`                    | Seconds to wait for a TCP connection before the request fails.                               |

Header and body timeouts follow `benchmark.timeout`. FloTest closes the pool at the end of the run so that the process exits.

### Cache-hit simulation

Set `benchmark.cachePercentage` to a value from 0 to 100 to make that percentage of requests resend the exact text of a prompt that FloTest already sent. This gives the endpoint's prefix cache a full-length match, so you can measure how caching changes TTFT and throughput.

FloTest applies the following rules:

- FloTest keeps the 20 most recent fresh prompts in a pool. A cache-hit request picks one of these prompts and resends the text unchanged.
- If no prompt has been sent yet, for example on the first request of a run, FloTest sends a fresh prompt and records `cacheHit: false` for that request.
- The `cacheHit` field in `run_log.jsonl` and the `cacheHitRate` in `summary.json` record what FloTest sent, not the random selection. The reported rate can therefore be slightly lower than the configured percentage.
- A cache-hit request does not consume a prompt from the fresh pool. `maxRequests` counts every dispatched request, including cache hits.

### Prompt generation

When `generator.enabled` is `true`, FloTest builds each prompt from lines of a text corpus until the prompt reaches its target input token count. FloTest draws the target for each prompt from a Gaussian distribution around `inputTokens.mean`. Each prompt also carries a target output token count, which FloTest sends as the `max_tokens` limit. For OpenAI reasoning models such as o1, o3, and o4-mini, FloTest sends `max_completion_tokens` instead.

- For 10 prompts or fewer, generation runs in the main process.
- For more than 10 prompts, FloTest splits the work across worker threads, one for each available CPU core, and writes `prompts.jsonl` as a stream so that large prompt sets do not exceed the Node.js string length limit.
- To use your own text, set `generator.corpus` to a path to a plain text file. To prepend an instruction to every prompt, set `generator.prompt`.

### SageMaker `provider.config` options

| Key             | Type                        | Default    | Description                                                                                                                                  |
| --------------- | --------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `requestFormat` | `"openai"` \| `"sagemaker"` | `"openai"` | Request body format. `"openai"` sends a `messages` array, which current LMI and vLLM containers accept. `"sagemaker"` sends a raw `inputs` string for legacy TGI containers. |

When `adapter` is `"sagemaker"`:

- `provider.model` is the SageMaker endpoint name, not a model ID.
- `provider.baseURL` replaces the default SageMaker runtime URL, `https://runtime.sagemaker.<region>.amazonaws.com`. Set `baseURL` if you use a VPC endpoint or a custom domain.
- Streaming requests use the `/endpoints/<model>/invocations-response-stream` path. Non-streaming requests use `/endpoints/<model>/invocations`.
- FloTest signs each request with AWS Signature Version 4 using the configured credentials.

## Metrics

### Per-request metrics

Each line in `run_log.jsonl` records the following values for one request:

- **TTFT.** Time to first token, in milliseconds, measured from the start of the request.
- **TTFNT.** Time to first non-thinking token, in milliseconds, for reasoning models.
- **End-to-end latency.** Total request time, in milliseconds.
- **Inter-token latencies.** Time between successive tokens for streaming requests.
- **Output throughput.** Output tokens per second.
- **Input and output token counts.**
- **Phase.** `ramp-up`, `steady`, or `ramp-down`.
- **Cache hit.** Whether the request resent an earlier prompt.
- **Error details.** The error message and code, if the request failed.

### Summary metrics

`summary.json` contains the following values for the whole run:

- Success count, failure count, and error rate.
- Empty-response count: successful requests that returned no output tokens.
- RPM and overall TPS.
- Percentiles p25, p50, p75, p90, p95, and p99 for every latency and throughput metric.
- Error counts grouped by error code.
- Request counts and error rates for each phase.
- Cache hit rate.

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

### Load test a self-hosted model

This example targets a local vLLM or Ollama server and uses ramp-up and ramp-down phases.

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

### Measure prefix cache behavior

This example resends a recent prompt for about 25% of requests, so you can compare TTFT for cache hits and cache misses in `run_log.jsonl`.

```json
{
  "provider": {
    "adapter": "openai",
    "model": "meta-llama/Llama-3-8B",
    "baseURL": "http://localhost:8000/v1"
  },
  "benchmark": {
    "concurrency": 16,
    "inputTokens": { "mean": 2048 },
    "outputTokens": { "mean": 128 },
    "maxRequests": 400,
    "cachePercentage": 25,
    "streaming": true
  }
}
```

### Tune the connection pool for a slow network path

If the endpoint sits behind an SSH tunnel or a high-latency link, increase `connectTimeout` and keep idle connections open longer.

```json
{
  "provider": {
    "adapter": "openai",
    "model": "meta-llama/Llama-3-8B",
    "baseURL": "http://localhost:8000/v1"
  },
  "benchmark": {
    "concurrency": 32,
    "inputTokens": { "mean": 512 },
    "outputTokens": { "mean": 256 },
    "maxDuration": 300,
    "timeout": 120
  },
  "http": {
    "keepAliveTimeout": 300,
    "connectTimeout": 30
  }
}
```

### Load test an Amazon SageMaker endpoint

Current SageMaker LMI and vLLM containers accept the Chat Completions `messages` format, so the default `requestFormat` works. Set `adapter` to `"sagemaker"` and set `model` to your SageMaker endpoint name.

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
export AWS_REGION="us-east-1"
export AWS_ACCESS_KEY_ID="AKIA..."
export AWS_SECRET_ACCESS_KEY="..."
# export AWS_SESSION_TOKEN="..."   # temporary credentials only

flotest run -c config.json
```

FloTest calls `https://runtime.sagemaker.<region>.amazonaws.com/endpoints/<model>/invocations-response-stream` for streaming requests and `.../invocations` for non-streaming requests, and signs each request with AWS Signature Version 4.

### Use the legacy SageMaker request format

Older TGI and Hugging Face containers do not accept the `messages` field. They expect the prompt as a raw string in the `inputs` field. To use this format, set `requestFormat` to `"sagemaker"` in `provider.config`:

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

With the legacy format, FloTest sends `{ "inputs": "<prompt>", "parameters": { "max_new_tokens": N } }`. FloTest does not apply a chat template, so format your prompts for the model that you target.

### Use a custom SageMaker endpoint URL with ramp-up

If your SageMaker endpoint uses a custom domain or a VPC endpoint, set `baseURL`:

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

### Run a time-bounded test with CSV output

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

## Contributing guide

The [contributing guide](CONTRIBUTING.md) describes how to set up a development environment, run the tests, and submit a pull request.

## License

MIT
