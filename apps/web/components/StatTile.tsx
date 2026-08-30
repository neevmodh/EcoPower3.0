// The stat tile — rebuilt per DESIGN.md §4.3 / issue #68. 2.0's version
// hardcoded badges as string literals ("Optimal", "+12%") regardless of
// whether real data existed. Every number and every badge here is derived;
// there is no path that renders a badge without a real comparison behind it.

import type { ReactNode } from "react";
import {
  computeDelta,
  formatInrFromPaise,
  formatNumber,
  isStale as computeIsStale,
  type TileState,
  type Comparison,
  type Confidence,
  type ReadyDataState,
} from "@ecopower/shared";
import { Sparkline } from "./Sparkline";

const STATE_COLOR: Record<TileState, string> = {
  good: "var(--color-status-good)",
  warning: "var(--color-status-warning)",
  serious: "var(--color-status-serious)",
  critical: "var(--color-status-critical)",
};

const CONFIDENCE_LABEL: Record<Exclude<Confidence, "measured">, string> = {
  estimated: "estimated",
  forecast: "forecast",
};

type BaseProps = {
  icon: ReactNode;
  label: string;
  unit?: string;
  sparkline?: number[];
  comparison?: Comparison | null;
  state?: TileState;
  // Confidence rendering, P3: estimated/forecast values render dashed, with
  // a visible label — the user should never have to ask which numbers are real.
  confidence?: Confidence;
  // Staleness, P2: computed from asOf + expectedIntervalMs, not a flag a
  // caller can forget to set. Omit either to skip the check.
  asOf?: Date;
  expectedIntervalMs?: number;
};

type NumericProps = BaseProps & { value: number | null | undefined; valuePaise?: never };
type CurrencyProps = BaseProps & { valuePaise: bigint | null | undefined; value?: never };

export function StatTile(props: NumericProps | CurrencyProps) {
  const { icon, label, unit, sparkline, comparison, state, confidence = "measured", asOf, expectedIntervalMs } = props;

  const stale =
    asOf && expectedIntervalMs != null
      ? computeIsStale({ status: "ready", data: null, confidence, asOf, expectedIntervalMs } as ReadyDataState<null>)
      : false;

  const isCurrency = "valuePaise" in props && props.valuePaise !== undefined;
  const hasData = isCurrency ? (props as CurrencyProps).valuePaise != null : (props as NumericProps).value != null;

  const displayValue = isCurrency
    ? formatInrFromPaise((props as CurrencyProps).valuePaise)
    : formatNumber((props as NumericProps).value, unit);

  // Delta math runs on plain numbers even for currency tiles — the ratio
  // itself doesn't need paise precision, only the displayed value does.
  const currentForDelta = isCurrency
    ? (props as CurrencyProps).valuePaise != null
      ? Number((props as CurrencyProps).valuePaise) / 100
      : null
    : (props as NumericProps).value;

  const delta = hasData ? computeDelta(currentForDelta, comparison) : null;
  const accent = state ? STATE_COLOR[state] : undefined;

  return (
    <div
      className="rounded-card border p-4"
      style={{
        borderColor: accent ?? "var(--color-border)",
        borderLeftWidth: accent ? "3px" : "1px",
        background: "var(--color-surface-card)",
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <span style={{ color: accent ?? "var(--color-text-secondary)" }}>{icon}</span>
        {delta && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular"
            style={{
              background: delta.direction === "up" ? "var(--color-status-good)" : "var(--color-status-serious)",
              color: "#fff",
            }}
          >
            {delta.direction === "up" ? "↗" : delta.direction === "down" ? "↘" : "→"}{" "}
            {delta.percent > 0 ? "+" : ""}
            {delta.percent.toFixed(1)}%
          </span>
        )}
      </div>

      <div className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--color-text-secondary)" }}>
        {label}
      </div>

      <div
        className="text-2xl tabular font-semibold mb-2"
        style={{
          color: stale ? "var(--color-text-secondary)" : undefined,
          borderBottom: confidence !== "measured" && hasData ? "2px dashed currentColor" : undefined,
          display: "inline-block",
        }}
      >
        {displayValue}
        {hasData && confidence !== "measured" && (
          <span
            className="ml-2 text-xs font-normal align-middle uppercase tracking-wide"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {CONFIDENCE_LABEL[confidence]}
          </span>
        )}
      </div>

      {hasData && stale && asOf && (
        <div className="text-xs mb-2" style={{ color: "var(--color-status-warning)" }}>
          Stale — as of {asOf.toLocaleTimeString()}
        </div>
      )}

      {hasData && (sparkline?.length || comparison) && (
        <div className="flex items-center gap-2 text-xs tabular" style={{ color: "var(--color-text-secondary)" }}>
          {sparkline && sparkline.length >= 2 && <Sparkline values={sparkline} />}
          {comparison && (
            <span>
              vs {comparison.value} {comparison.windowLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
