import { router } from "expo-router";
// Field-technician home (#43's skeleton, #45's offline outbox wired to a
// real mutation). Work-order status changes go through the outbox instead
// of straight to Supabase — this is the actual demo #45 asks for: put the
// device in airplane mode, tap "Start"/"Complete", watch it sit in the
// queue with a visible badge, then watch it flush the moment connectivity
// (or just the next AppState-active tick) comes back.
import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SyncBadge } from "../../components/SyncBadge";
import { useOutbox } from "../../hooks/useOutbox";
import { supabase } from "../../lib/supabase";

interface WorkOrder {
  id: string;
  title: string;
  status: string;
  service_connections: { consumer_number: string } | null;
}

const NEXT_ACTION: Record<
  string,
  { action: "claim" | "start" | "complete"; label: string } | null
> = {
  open: { action: "start", label: "Start" },
  in_progress: { action: "complete", label: "Complete" },
  completed: null,
  cancelled: null,
};

export default function FieldHome() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const { rows, pending, sync, enqueue } = useOutbox();

  const conflicts = rows.filter((r) => r.status === "conflict");
  const syncing = rows.some((r) => r.status === "syncing");

  const loadWorkOrders = useCallback(async () => {
    // No org filter — RLS (work_orders_resco_scope, 0019) scopes this to
    // the technician's own RESCO org already.
    const { data } = await supabase
      .from("work_orders")
      .select("id, title, status, service_connections(consumer_number)")
      .in("status", ["open", "in_progress"])
      .order("created_at", { ascending: false });
    setWorkOrders((data ?? []) as unknown as WorkOrder[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadWorkOrders();
  }, [loadWorkOrders]);

  // Optimistic local status so a queued-but-not-yet-synced action doesn't
  // look like nothing happened — the outbox row is still the source of
  // truth for whether it actually went through.
  function localStatusFor(wo: WorkOrder): string {
    const queued = rows.find(
      (r) =>
        r.kind === "work_order_status" &&
        r.status !== "conflict" &&
        JSON.parse(r.payload).workOrderId === wo.id,
    );
    if (!queued) return wo.status;
    const action = JSON.parse(queued.payload).action as
      | "claim"
      | "start"
      | "complete";
    return action === "start"
      ? "in_progress"
      : action === "complete"
        ? "completed"
        : wo.status;
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <View className="flex-1 bg-surface px-4 pt-14">
      <View className="mb-4 flex-row items-center justify-between">
        <Text className="text-xl font-semibold text-diverging-zero">
          Field Technician
        </Text>
        <SyncBadge
          pending={pending}
          conflicts={conflicts}
          syncing={syncing}
          onPress={sync}
        />
      </View>

      {conflicts.length > 0 ? (
        <View className="mb-3 gap-2">
          {conflicts.map((c) => (
            <View
              key={c.id}
              className="rounded-lg border border-status-critical bg-status-critical/5 p-3"
            >
              <Text className="text-sm text-status-critical">
                {c.last_error}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <FlatList
        data={workOrders}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadWorkOrders} />
        }
        ListEmptyComponent={
          !loading ? (
            <Text className="mt-8 text-center text-gray-500">
              No open work orders.
            </Text>
          ) : null
        }
        renderItem={({ item }) => {
          const status = localStatusFor(item);
          const next = NEXT_ACTION[status];
          return (
            <View className="mb-3 rounded-xl border border-gray-200 bg-white p-4">
              <Text className="text-base font-medium text-diverging-zero">
                {item.title}
              </Text>
              <Text className="mt-1 text-xs text-gray-500">
                {item.service_connections?.consumer_number ?? "—"} · {status}
              </Text>
              {next ? (
                <TouchableOpacity
                  onPress={() =>
                    enqueue("work_order_status", {
                      workOrderId: item.id,
                      action: next.action,
                    })
                  }
                  className="mt-3 self-start rounded-lg bg-categorical-consumption px-3 py-1.5"
                >
                  <Text className="text-sm font-medium text-white">
                    {next.label}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        }}
      />

      <TouchableOpacity
        onPress={signOut}
        className="mb-6 items-center rounded-lg border border-gray-300 px-4 py-2"
      >
        <Text>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}
