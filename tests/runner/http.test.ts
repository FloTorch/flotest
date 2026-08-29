import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { fetch } from "undici";
import { ConfigSchema } from "../../src/schemas/config.zod.ts";
import { createHttpAgent } from "../../src/runner/http.ts";
import { makeConfig } from "../helpers.ts";

function startServer(holdMs = 0) {
  let connections = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  const server: Server = createServer((_req, res) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    setTimeout(() => {
      inFlight--;
      res.end("ok");
    }, holdMs);
  });
  server.on("connection", () => connections++);
  return new Promise<{ url: string; server: Server; stats: () => { connections: number; maxInFlight: number } }>(
    (resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const { port } = server.address() as { port: number };
        resolve({
          url: `http://127.0.0.1:${port}/`,
          server,
          stats: () => ({ connections, maxInFlight }),
        });
      });
    },
  );
}

describe("http config schema", () => {
  it("applies defaults when http block is omitted", () => {
    const parsed = ConfigSchema.parse({
      benchmark: {
        inputTokens: { mean: 10 },
        outputTokens: { mean: 10 },
        maxRequests: 1,
        concurrency: 1,
      },
      provider: { model: "m" },
    });
    expect(parsed.http).toEqual({ keepAliveTimeout: 60, connectTimeout: 10 });
  });
});

describe("createHttpAgent", () => {
  const servers: Server[] = [];
  afterEach(async () => {
    for (const s of servers) await new Promise((r) => s.close(r));
    servers.length = 0;
  });

  it("reuses one TCP connection across sequential requests", async () => {
    const { url, server, stats } = await startServer();
    servers.push(server);
    const agent = createHttpAgent(makeConfig());
    try {
      for (let i = 0; i < 4; i++) {
        const res = await fetch(url, { dispatcher: agent });
        await res.text();
      }
    } finally {
      await agent.close();
    }
    expect(stats().connections).toBe(1);
  });

  it("defaults the pool size to benchmark.concurrency", async () => {
    const { url, server, stats } = await startServer(50);
    servers.push(server);
    const config = makeConfig();
    config.benchmark.concurrency = 2;
    const agent = createHttpAgent(config);
    try {
      await Promise.all(
        Array.from({ length: 6 }, () =>
          fetch(url, { dispatcher: agent }).then((r) => r.text()),
        ),
      );
    } finally {
      await agent.close();
    }
    expect(stats().maxInFlight).toBe(2);
    expect(stats().connections).toBe(2);
  });

  it("uses http.maxConnections when set", async () => {
    const { url, server, stats } = await startServer(50);
    servers.push(server);
    const config = makeConfig();
    config.benchmark.concurrency = 1;
    config.http.maxConnections = 3;
    const agent = createHttpAgent(config);
    try {
      await Promise.all(
        Array.from({ length: 6 }, () =>
          fetch(url, { dispatcher: agent }).then((r) => r.text()),
        ),
      );
    } finally {
      await agent.close();
    }
    expect(stats().maxInFlight).toBe(3);
  });
});
