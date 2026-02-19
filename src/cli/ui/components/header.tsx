import { Box, Text } from "ink";

interface HeaderProps {
  modelName: string;
  maxConcurrency: number;
  streaming: boolean;
  totalTarget: number;
}

export function Header({ modelName, maxConcurrency, streaming, totalTarget }: HeaderProps) {
  const targetStr = totalTarget === Infinity ? "∞" : String(totalTarget);

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        FLOTorch Load Tester
      </Text>
      <Text>
        <Text dimColor>Model: </Text>
        <Text bold>{modelName}</Text>
        <Text dimColor>{"  Concurrency: "}</Text>
        <Text bold>{maxConcurrency}</Text>
        <Text dimColor>{"  Streaming: "}</Text>
        <Text bold>{streaming ? "yes" : "no"}</Text>
        <Text dimColor>{"  Requests: "}</Text>
        <Text bold>{targetStr}</Text>
      </Text>
    </Box>
  );
}
