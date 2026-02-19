import { Box, Text } from "ink";

interface ProgressBarProps {
  completed: number;
  totalTarget: number;
  elapsedMs: number;
  rps: number;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m${s.toString().padStart(2, "0")}s` : `${s}s`;
}

export function ProgressBar({ completed, totalTarget, elapsedMs, rps }: ProgressBarProps) {
  const barWidth = 30;
  const isInfinite = totalTarget === Infinity || totalTarget <= 0;
  const pct = isInfinite ? 0 : Math.min(1, completed / totalTarget);
  const filled = Math.round(pct * barWidth);
  const empty = barWidth - filled;
  const elapsedSec = elapsedMs / 1000;

  let eta = "";
  if (!isInfinite && rps > 0) {
    const remaining = (totalTarget - completed) / rps;
    eta = `ETA: ${formatDuration(remaining)}`;
  }

  const targetStr = isInfinite ? "?" : String(totalTarget);
  const pctStr = isInfinite ? "" : ` (${(pct * 100).toFixed(1)}%)`;

  return (
    <Box flexDirection="column">
      <Text>
        <Text dimColor>Progress </Text>
        <Text color="green">{"█".repeat(filled)}</Text>
        <Text dimColor>{"░".repeat(empty)}</Text>
        <Text>
          {" "}
          {completed}/{targetStr}
          {pctStr}
        </Text>
      </Text>
      <Text dimColor>
        {"Elapsed: "}
        {formatDuration(elapsedSec)}
        {"   "}
        {rps.toFixed(1)} req/s
        {"   "}
        {eta}
      </Text>
    </Box>
  );
}
