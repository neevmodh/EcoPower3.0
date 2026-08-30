"use client";

import { useLiveMeter, type LiveMeterReading } from "@/lib/useLiveMeter";
import { StatTile } from "./StatTile";
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
    <div>
      <div className="flex justify-end mb-1">
        <ConnectionIndicator state={connectionState} />
      </div>
      <StatTile
        icon="⚡"
        label={label}
        value={reading?.kwhImport ?? null}
        unit="kWh"
        asOf={reading ? new Date(reading.readingTs) : undefined}
        expectedIntervalMs={30 * 60_000}
      />
    </div>
  );
}
