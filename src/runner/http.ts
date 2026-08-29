import { Agent, setGlobalDispatcher } from "undici";
import type { Config } from "../types/config.ts";

/**
 * Creates a keep-alive connection pool sized for the benchmark.
 *
 * Pool size defaults to `benchmark.concurrency` so every worker can hold a
 * socket. Header and body timeouts are disabled because `benchmark.timeout`
 * already bounds each request through an `AbortSignal`.
 */
export function createHttpAgent(config: Config): Agent {
  return new Agent({
    connections: config.http.maxConnections ?? config.benchmark.concurrency,
    keepAliveTimeout: config.http.keepAliveTimeout * 1000,
    connect: { timeout: config.http.connectTimeout * 1000 },
    headersTimeout: 0,
    bodyTimeout: 0,
  });
}

/** Installs the pool as the dispatcher behind global `fetch()`. Close it when the run ends. */
export function installHttpAgent(config: Config): Agent {
  const agent = createHttpAgent(config);
  setGlobalDispatcher(agent);
  return agent;
}
