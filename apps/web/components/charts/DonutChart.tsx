"use client";

import { useState } from "react";

// Composition ring — a single categorical breakdown that sums to a
// meaningful whole (fleet capacity by asset type, connections by tariff).
// Segments have a 2px surface gap between them (§4.1), a center total, and
// a hover that lifts one segment and names it. Not for time series.

export type DonutSlice = { key: string; label: string; value: number; color: string };

export function DonutChart({
  slices,
  centerLabel,
  centerValue,
  unit,
}: {
  slices: DonutSlice[];
  centerLabel: string;
  centerValue: string;
  unit?: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const R = 52;
  const C = 2 * Math.PI * R;
  const GAP = 3; // px of circumference left blank between segments

  let offset = 0;
  const segs = slices.map((s) => {
    const frac = s.value / total;
    const len = Math.max(0, frac * C - GAP);
    const seg = { ...s, dash: `${len.toFixed(2)} ${(C - len).toFixed(2)}`, dashoffset: (-offset).toFixed(2), frac };
    offset += frac * C;
    return seg;
  });

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg
        viewBox="0 0 140 140"
        width={140}
        height={140}
        role="img"
        aria-label={`${centerLabel} ${centerValue}. ${segs.map((s) => `${s.label} ${s.value}${unit ? ` ${unit}` : ""}`).join(", ")}`}
      >
        <circle cx={70} cy={70} r={R} fill="none" stroke="var(--color-surface-sunken)" strokeWidth={14} />
        {segs.map((s) => (
          <circle
            key={s.key}
            cx={70}
            cy={70}
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth={hover === s.key ? 18 : 14}
            strokeDasharray={s.dash}
            strokeDashoffset={s.dashoffset}
            transform="rotate(-90 70 70)"
            className="animate-ring cursor-pointer"
            style={{ transition: "stroke-width 150ms ease" }}
            onMouseEnter={() => setHover(s.key)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        <text x={70} y={66} textAnchor="middle" fontSize={17} className="mono" fontWeight={600} fill="var(--color-text-primary)">
          {centerValue}
        </text>
        <text x={70} y={82} textAnchor="middle" fontSize={8.5} className="mono" fill="var(--color-text-tertiary)" style={{ letterSpacing: "0.12em" }}>
          {centerLabel.toUpperCase()}
        </text>
      </svg>

      <ul className="space-y-1.5 text-xs">
        {segs.map((s) => (
          <li
            key={s.key}
            className="flex items-center gap-2"
            onMouseEnter={() => setHover(s.key)}
            onMouseLeave={() => setHover(null)}
            style={{ opacity: hover && hover !== s.key ? 0.5 : 1, transition: "opacity 150ms" }}
          >
            <span className="inline-block rounded-full" style={{ width: 9, height: 9, background: s.color }} />
            <span style={{ color: "var(--color-text-secondary)" }}>{s.label}</span>
            <span className="mono font-semibold ml-auto pl-4 tabular">
              {s.value}
              {unit ? ` ${unit}` : ""}
            </span>
            <span className="mono tabular" style={{ color: "var(--color-text-tertiary)" }}>
              {(s.frac * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
