import { router } from "expo-router";
// Placeholder home for the consumer/society-member persona (#43's
// skeleton), now with a real live-data tile (#44) — the first screen here
// that's more than an auth-shell proof. The rest (bills, meter-read
// submission) land as their own issues.
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { LiveMeterTile } from "../../components/LiveMeterTile";
import { supabase } from "../../lib/supabase";
import type { LiveMeterReading } from "../../lib/useLiveMeter";

export default function ConsumerHome() {
  const [loading, setLoading] = useState(true);
  const [meterId, setMeterId] = useState<string | null>(null);
  const [initial, setInitial] = useState<LiveMeterReading | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // No owner filter — RLS scopes this to the signed-in consumer's own
      // rows, same as every equivalent query on web.
      const { data: connections } = await supabase
        .from("service_connections")
        .select("id");
      const connectionIds = (connections ?? []).map((c) => c.id);
      if (connectionIds.length === 0) {
        if (!cancelled) setLoading(false);
        return;
      }

      const { data: meter } = await supabase
        .from("meters")
        .select("id")
        .in("service_connection_id", connectionIds)
        .limit(1)
        .maybeSingle();
      if (!meter) {
        if (!cancelled) setLoading(false);
        return;
      }

      const { data: liveState } = await supabase
        .from("meter_live_state")
        .select("meter_id, last_reading_ts, kwh_import, kwh_export")
        .eq("meter_id", meter.id)
        .maybeSingle();

      if (cancelled) return;
      setMeterId(meter.id);
      setInitial(
        liveState
          ? {
              meterId: liveState.meter_id,
              readingTs: liveState.last_reading_ts,
              kwhImport: liveState.kwh_import,
              kwhExport: liveState.kwh_export,
            }
          : null,
      );
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-surface px-6">
      <Text className="text-xl font-semibold text-diverging-zero">
        Consumer
      </Text>

      {loading ? (
        <ActivityIndicator />
      ) : meterId ? (
        <LiveMeterTile meterId={meterId} initial={initial} />
      ) : (
        <Text className="text-center text-gray-500">
          No meter linked to this account yet.
        </Text>
      )}

      <TouchableOpacity
        onPress={signOut}
        className="rounded-lg border border-gray-300 px-4 py-2"
      >
        <Text>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}
