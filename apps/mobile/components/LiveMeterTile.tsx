// Mobile equivalent of apps/web/components/LiveMeterTile.tsx.
import { Text, View } from "react-native";
import { type LiveMeterReading, useLiveMeter } from "../lib/useLiveMeter";
import { ConnectionIndicator } from "./ConnectionIndicator";

export function LiveMeterTile({
  meterId,
  initial,
  label = "Live import",
}: {
  meterId: string;
  initial: LiveMeterReading | null;
  label?: string;
}) {
  const { reading, connectionState } = useLiveMeter(meterId, initial);

  return (
    <View className="w-full rounded-2xl border border-gray-200 bg-white p-4">
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-xs text-gray-500">{label}</Text>
        <ConnectionIndicator state={connectionState} />
      </View>
      <Text className="text-3xl font-semibold text-diverging-zero">
        {reading?.kwhImport != null ? reading.kwhImport.toFixed(2) : "—"}
        <Text className="text-base font-normal text-gray-500"> kWh</Text>
      </Text>
      {reading?.readingTs ? (
        <Text className="mt-1 text-xs text-gray-400">
          as of {new Date(reading.readingTs).toLocaleTimeString()}
        </Text>
      ) : null}
    </View>
  );
}
