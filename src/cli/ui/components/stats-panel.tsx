import { Box, Text } from "ink";

interface StatsPanelProps {
  rps: number;
  outputTps: number;
  inputTps: number;
  recentTtft: number[];
  recentE2eLatency: number[];
  errors: number;
  completed: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)]!;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (const v of arr) sum += v;
  return sum / arr.length;
}

function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

export function StatsPanel({
  rps,
  outputTps,
  inputTps,
  recentTtft,
  recentE2eLatency,
  errors,
  completed,
}: StatsPanelProps) {
  const sortedTtft = [...recentTtft].sort((a, b) => a - b);
  const sortedE2e = [...recentE2eLatency].sort((a, b) => a - b);

  const errRate = completed > 0 ? ((errors / completed) * 100).toFixed(1) : "0.0";
  const labelW = 14;
  const valW = 10;

  return (
    <Box flexDirection="column">
      <Text bold dimColor>
        {"Live Stats"}
      </Text>

      <Box>
        <Box width={labelW}>
          <Text dimColor>Requests/s</Text>
        </Box>
        <Box width={valW}>
          <Text bold>{rps.toFixed(1)}</Text>
        </Box>
        <Box width={labelW}>
          <Text dimColor>Out tok/s</Text>
        </Box>
        <Box width={valW}>
          <Text bold>{outputTps.toFixed(0)}</Text>
        </Box>
        <Box width={labelW}>
          <Text dimColor>In tok/s</Text>
        </Box>
        <Box width={valW}>
          <Text bold>{inputTps.toFixed(0)}</Text>
        </Box>
      </Box>

      <Box>
        <Box width={labelW}>
          <Text dimColor>TTFT</Text>
        </Box>
        <Text>
          <Text dimColor>mean=</Text>
          <Text>{fmtMs(mean(sortedTtft))}</Text>
          <Text dimColor>{"  p50="}</Text>
          <Text>{fmtMs(percentile(sortedTtft, 50))}</Text>
          <Text dimColor>{"  p95="}</Text>
          <Text>{fmtMs(percentile(sortedTtft, 95))}</Text>
        </Text>
      </Box>

      <Box>
        <Box width={labelW}>
          <Text dimColor>E2E</Text>
        </Box>
        <Text>
          <Text dimColor>mean=</Text>
          <Text>{fmtMs(mean(sortedE2e))}</Text>
          <Text dimColor>{"  p50="}</Text>
          <Text>{fmtMs(percentile(sortedE2e, 50))}</Text>
          <Text dimColor>{"  p95="}</Text>
          <Text>{fmtMs(percentile(sortedE2e, 95))}</Text>
        </Text>
      </Box>

      <Box>
        <Box width={labelW}>
          <Text dimColor>Errors</Text>
        </Box>
        <Text color={errors > 0 ? "red" : undefined} bold={errors > 0}>
          {errors} ({errRate}%)
        </Text>
      </Box>
    </Box>
  );
}
