import { Box, Text } from "ink";

interface ErrorPanelProps {
  recentErrors: string[];
}

export function ErrorPanel({ recentErrors }: ErrorPanelProps) {
  if (recentErrors.length === 0) return null;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="red" bold>
        Recent Errors:
      </Text>
      {recentErrors.map((err, i) => (
        <Text key={i} color="red" dimColor>
          {"  "} {err.length > 80 ? err.slice(0, 77) + "..." : err}
        </Text>
      ))}
    </Box>
  );
}
