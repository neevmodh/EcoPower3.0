"use client";

import { useState } from "react";

// Ordered horizontal bar with direct labels — DESIGN.md §4.2 for invoice
// breakdown, DT loss ranking, society allocation, fleet capacity. Every row
// carries its own value label (no legend needed), bars grow in from the
// left once, per-bar hover tooltip with an optional secondary line.

export type RankedRow = {
  key: string;
  label: string;
  value: number;
  /** overrides the auto colour for this row (e.g. a threshold breach) */
  color?: string;
  /** formatted value shown at the bar end; defaults to value.toFixed(1) */
  display?: string;
  /** extra context shown on hover */
  note?: string;
  href?: string;
};

export function RankedBar({
  rows,
  accent = "var(--color-categorical-consumption)",
  unit,
  sort = true,
}: {
  rows: RankedRow[];
  accent?: string;
  unit?: string;
  sort?: boolean;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const ordered = sort ? [...rows].sort((a, b) => b.value - a.value) : rows;
  const max = Math.max(1, ...ordered.map((r) => Math.abs(r.value)));

  return (
    <div className="space-y-2.5">
      {ordered.map((r, i) => {
        const pct = Math.max(0, Math.min(100, (Math.abs(r.value) / max) * 100));
        const barColor = r.color ?? accent;
        const active = hover === r.key;
        const RowTag = r.href ? "a" : "div";
        return (
          <RowTag
            key={r.key}
            {...(r.href ? { href: r.href } : {})}
            className="block group"
            onMouseEnter={() => setHover(r.key)}
            onMouseLeave={() => setHover(null)}
          >
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <span className="text-xs truncate" style={{ color: "var(--color-text-secondary)" }}>
                {r.label}
              </span>
              <span className="mono text-xs font-semibold tabular shrink-0" style={{ color: r.color ?? "var(--color-text-primary)" }}>
                {r.display ?? r.value.toFixed(1)}
                {unit ? ` ${unit}` : ""}
              </span>
            </div>
            <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "var(--color-surface-sunken)" }}>
              <div
                className="chart-bar h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  background: barColor,
                  animationDelay: `${i * 60}ms`,
                  filter: active ? "brightness(1.15)" : undefined,
                  boxShadow: active ? `0 0 10px ${barColor}` : undefined,
                }}
              />
            </div>
            {active && r.note && (
              <div className="text-[11px] mt-1" style={{ color: "var(--color-text-tertiary)" }}>
                {r.note}
              </div>
            )}
          </RowTag>
        );
      })}
    </div>
  );
}
