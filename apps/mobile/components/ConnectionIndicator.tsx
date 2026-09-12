// Mobile equivalent of apps/web/components/ConnectionIndicator.tsx — same
// deliberate rule: only the genuinely-connected state gets to look "live."
// No pulsing dot hardcoded to always show green regardless of reality.
import { Text, View } from "react-native";
import type { ConnectionState } from "../lib/useLiveMeter";

const LABEL: Record<ConnectionState, string> = {
  connecting: "Connecting…",
  connected: "Live",
  reconnecting: "Reconnecting…",
  polling: "Polling (5s)",
};

const DOT_CLASS: Record<ConnectionState, string> = {
  connecting: "bg-gray-400",
  connected: "bg-status-good",
  reconnecting: "bg-status-warning",
  polling: "bg-status-warning",
};

const TEXT_CLASS: Record<ConnectionState, string> = {
  connecting: "text-gray-500",
  connected: "text-status-good",
  reconnecting: "text-status-warning",
  polling: "text-status-warning",
};

export function ConnectionIndicator({ state }: { state: ConnectionState }) {
  return (
    <View className="flex-row items-center gap-2">
      <View className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[state]}`} />
      <Text className={`text-xs ${TEXT_CLASS[state]}`}>{LABEL[state]}</Text>
    </View>
  );
}
