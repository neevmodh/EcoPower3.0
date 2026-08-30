"use client";

// Composes StatTile (#68's happy path + stale/confidence rendering) with the
// four non-happy-path states (#69) around a single DataState input. This is
// the component every panel should reach for instead of hand-rolling
// loading/empty/error handling per call site.

import type { ReactNode } from "react";
import type { DataState } from "@ecopower/shared";
import { StatTile } from "./StatTile";
import { StatTileEmpty, StatTileError, StatTileSkeleton } from "./StatTileStates";

type NumericExtract = { value: number; unit?: string };
type CurrencyExtract = { valuePaise: bigint };

export function StatTileWithState<T extends NumericExtract | CurrencyExtract>({
  icon,
  label,
  state,
  comparison,
  sparkline,
  tileState,
  onWiden,
  onRetry,
}: {
  icon: ReactNode;
  label: string;
  state?: Parameters<typeof StatTile>[0]["state"];
  comparison?: Parameters<typeof StatTile>[0]["comparison"];
  sparkline?: number[];
  tileState: DataState<T>;
  onWiden?: () => void;
  onRetry?: () => void;
}) {
  if (tileState.status === "loading") return <StatTileSkeleton />;

  if (tileState.status === "empty") {
    return <StatTileEmpty icon={icon} label={label} windowLabel={tileState.windowLabel} onWiden={onWiden} />;
  }

  if (tileState.status === "error") {
    return <StatTileError icon={icon} label={label} message={tileState.message} onRetry={onRetry} />;
  }

  const { data, confidence, asOf, expectedIntervalMs } = tileState;

  if ("valuePaise" in data) {
    return (
      <StatTile
        icon={icon}
        label={label}
        state={state}
        comparison={comparison}
        confidence={confidence}
        asOf={asOf}
        expectedIntervalMs={expectedIntervalMs}
        valuePaise={data.valuePaise}
      />
    );
  }

  return (
    <StatTile
      icon={icon}
      label={label}
      state={state}
      comparison={comparison}
      sparkline={sparkline}
      confidence={confidence}
      asOf={asOf}
      expectedIntervalMs={expectedIntervalMs}
      value={data.value}
      unit={data.unit}
    />
  );
}
