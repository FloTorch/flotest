import { useState, useEffect } from "react";
import { Box } from "ink";
import type { BenchmarkStore, StoreSnapshot } from "./store.ts";
import { Header } from "./components/header.tsx";
import { PhaseBar } from "./components/phase-bar.tsx";
import { ProgressBar } from "./components/progress-bar.tsx";
import { StatsPanel } from "./components/stats-panel.tsx";
import { ErrorPanel } from "./components/error-panel.tsx";

interface AppProps {
  store: BenchmarkStore;
}

export function App({ store }: AppProps) {
  const [snap, setSnap] = useState<StoreSnapshot>(() => store.snapshot());

  useEffect(() => {
    const id = setInterval(() => {
      setSnap(store.snapshot());
    }, 200);
    return () => clearInterval(id);
  }, [store]);

  const elapsedMs = snap.startTime > 0 ? performance.now() - snap.startTime : 0;
  const elapsedSec = elapsedMs / 1000;
  const rps = elapsedSec > 0 ? snap.completed / elapsedSec : 0;
  const outputTps = elapsedSec > 0 ? snap.totalOutputTokens / elapsedSec : 0;
  const inputTps = elapsedSec > 0 ? snap.totalInputTokens / elapsedSec : 0;

  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Header
        modelName={snap.modelName}
        maxConcurrency={snap.maxConcurrency}
        streaming={snap.streaming}
        totalTarget={snap.totalTarget}
      />
      <Box marginTop={1}>
        <PhaseBar
          phase={snap.phase}
          activeSlots={snap.activeSlots}
          allowedConcurrency={snap.allowedConcurrency}
        />
      </Box>
      <Box marginTop={1} flexDirection="column">
        <ProgressBar
          completed={snap.completed}
          totalTarget={snap.totalTarget}
          elapsedMs={elapsedMs}
          rps={rps}
        />
      </Box>
      <Box marginTop={1}>
        <StatsPanel
          rps={rps}
          outputTps={outputTps}
          inputTps={inputTps}
          recentTtft={snap.recentTtft}
          recentE2eLatency={snap.recentE2eLatency}
          errors={snap.errors}
          emptyResponses={snap.emptyResponses}
          completed={snap.completed}
        />
      </Box>
      <ErrorPanel recentErrors={snap.recentErrors} />
    </Box>
  );
}
