import { Box, Text } from "ink";
import type { Phase } from "../../../types/metrics.ts";

interface PhaseBarProps {
  phase: Phase;
  activeSlots: number;
  allowedConcurrency: number;
}

const phaseColors: Record<Phase, string> = {
  "ramp-up": "yellow",
  steady: "green",
  "ramp-down": "magenta",
};

const phaseLabels: Record<Phase, string> = {
  "ramp-up": "Ramp Up",
  steady: "Steady State",
  "ramp-down": "Ramp Down",
};

export function PhaseBar({ phase, activeSlots, allowedConcurrency }: PhaseBarProps) {
  const color = phaseColors[phase];
  const barWidth = 20;
  const filled =
    allowedConcurrency > 0 ? Math.round((activeSlots / allowedConcurrency) * barWidth) : 0;
  const empty = barWidth - filled;

  return (
    <Box>
      <Text>
        <Text dimColor>Phase: </Text>
        <Text color={color} bold>
          {"● "}
        </Text>
        <Text color={color}>{phaseLabels[phase]}</Text>
        <Text dimColor>{"   Slots: "}</Text>
        <Text color="cyan">{"█".repeat(filled)}</Text>
        <Text dimColor>{"░".repeat(empty)}</Text>
        <Text>
          {" "}
          {activeSlots}/{allowedConcurrency}
        </Text>
      </Text>
    </Box>
  );
}
