// #45's explicit, non-negotiable requirement: never hide queue state from
// the technician. No badge at all when the queue is empty — that's the
// honest "fully synced" state, not something to fake with a green
// checkmark that might be stale.
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import type { OutboxRow } from "../lib/outbox/types";

export function SyncBadge({
  pending,
  conflicts,
  syncing,
  onPress,
}: {
  pending: number;
  conflicts: OutboxRow[];
  syncing?: boolean;
  onPress?: () => void;
}) {
  if (pending === 0 && conflicts.length === 0) return null;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      className={`flex-row items-center gap-2 rounded-full px-3 py-1.5 ${
        conflicts.length > 0 ? "bg-status-critical/10" : "bg-status-warning/10"
      }`}
    >
      {syncing ? (
        <ActivityIndicator size="small" />
      ) : (
        <View
          className={`h-2 w-2 rounded-full ${conflicts.length > 0 ? "bg-status-critical" : "bg-status-warning"}`}
        />
      )}
      <Text
        className={`text-xs font-medium ${conflicts.length > 0 ? "text-status-critical" : "text-status-warning"}`}
      >
        {conflicts.length > 0
          ? `${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"}, ${pending} pending sync`
          : `${pending} pending sync`}
      </Text>
    </TouchableOpacity>
  );
}
