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
import { PanelIcon } from "./Icon";

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
      className="rounded-card border p-4 card-lift relative overflow-hidden"
      style={{
        borderColor: accent ? `color-mix(in oklab, ${accent} 45%, var(--color-border))` : "var(--color-border)",
        background: "var(--color-surface-card)",
      }}
    >
      {/* State reads as a lit top edge rather than a heavy left border — it
          sits at the same weight as the panel accent in the rail. */}
      {accent && (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: accent, boxShadow: `0 0 12px ${accent}` }}
        />
      )}

      <div className="flex items-start justify-between mb-3">
        <span style={{ color: accent ?? "var(--color-text-tertiary)" }}>{icon}</span>
        {delta && (
          <span
            className="inline-flex items-center gap-1 rounded-control px-2 py-0.5 text-[11px] font-semibold mono border"
            style={{
              color: delta.direction === "up" ? "var(--color-status-good)" : "var(--color-status-serious)",
              borderColor:
                delta.direction === "up"
                  ? "color-mix(in oklab, var(--color-status-good) 40%, transparent)"
                  : "color-mix(in oklab, var(--color-status-serious) 40%, transparent)",
              background:
                delta.direction === "up"
                  ? "color-mix(in oklab, var(--color-status-good) 12%, transparent)"
                  : "color-mix(in oklab, var(--color-status-serious) 12%, transparent)",
            }}
          >
            {delta.direction === "up" ? "↗" : delta.direction === "down" ? "↘" : "→"}{" "}
            {delta.percent > 0 ? "+" : ""}
            {delta.percent.toFixed(1)}%
          </span>
        )}
      </div>

      <div className="eyebrow mb-1.5">{label}</div>

      <div
        className="text-2xl mono font-semibold mb-2"
        style={{
          color: stale ? "var(--color-text-secondary)" : undefined,
          borderBottom: confidence !== "measured" && hasData ? "2px dashed currentColor" : undefined,
          display: "inline-block",
        }}
      >
        {displayValue}
        {hasData && confidence !== "measured" && (
          <span className="eyebrow ml-2 align-middle">{CONFIDENCE_LABEL[confidence]}</span>
        )}
      </div>

      {hasData && stale && asOf && (
        // "as of" is inherently viewer-local: the server renders it in the
        // server's zone and the browser corrects it on hydration. Explicit
        // locale + 24h so only the zone can differ (not AM/PM casing), and
        // suppressHydrationWarning because that one-frame correction is the
        // intended behaviour, not a bug to hide.
        <div
          className="text-xs mb-2 flex items-center gap-1.5"
          style={{ color: "var(--color-status-warning)" }}
          suppressHydrationWarning
        >
          <PanelIcon name="clock" size={13} />
          Stale — last read{" "}
          {asOf.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
        </div>
      )}

      {hasData && (sparkline?.length || comparison) && (
        <div className="flex items-center gap-2 text-xs mono" style={{ color: "var(--color-text-tertiary)" }}>
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
