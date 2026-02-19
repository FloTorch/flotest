export function createAbortController(): {
  controller: AbortController;
  onShutdown: (fn: () => void) => void;
} {
  const controller = new AbortController();
  const shutdownCallbacks: (() => void)[] = [];

  let shutdownCount = 0;
  const handler = () => {
    shutdownCount++;
    if (shutdownCount === 1) {
      console.log("\nGraceful shutdown initiated... (press Ctrl+C again to force)");
      controller.abort();
      for (const cb of shutdownCallbacks) cb();
    } else {
      process.exit(1);
    }
  };

  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);

  return {
    controller,
    onShutdown: (fn) => shutdownCallbacks.push(fn),
  };
}
