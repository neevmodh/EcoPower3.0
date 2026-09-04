"use client";

import { useId, useMemo, useRef, useState } from "react";

// Layered area, one axis — DESIGN.md §4.2's form for two series sharing a
// unit (generation vs load, import vs export). Hand-rolled SVG per §4.1:
// 2px lines, 4px rounded ends, recessive grid, hover crosshair + tooltip,
// hit target wider than the mark. The line paths draw themselves in once on
// mount (.animate-draw) — the reveal traces the real series, it invents no
// values.

export type AreaSeries = {
  key: string;
  label: string;
  color: string;
  points: number[];
};

const W = 760;
const H = 220;
const PAD = { top: 14, right: 14, bottom: 26, left: 40 };

export function AreaChart({
  series,
  labels,
  unit,
  valueDigits = 1,
}: {
  series: AreaSeries[];
  labels: string[];
  unit: string;
  valueDigits?: number;
}) {
  const uid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const n = labels.length;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const max = useMemo(() => {
    const m = Math.max(1, ...series.flatMap((s) => s.points));
    // round up to a friendly-ish ceiling so the top gridline is readable
    const mag = 10 ** Math.floor(Math.log10(m));
    return Math.ceil(m / mag) * mag;
  }, [series]);

  const x = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;

  const linePath = (pts: number[]) => pts.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const areaPath = (pts: number[]) =>
    `${linePath(pts)} L${x(n - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;

  const gridVals = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);

  const onMove = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg || n === 0) return;
    const rect = svg.getBoundingClientRect();
    const localX = ((clientX - rect.left) / rect.width) * W - PAD.left;
    const i = Math.round((localX / plotW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const tickIdx = n <= 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: "auto", overflow: "visible" }}
        role="img"
        aria-label={`${series.map((s) => s.label).join(" and ")} over ${n} points, in ${unit}`}
        onMouseMove={(e) => onMove(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchMove={(e) => e.touches[0] && onMove(e.touches[0].clientX)}
        onTouchEnd={() => setHover(null)}
      >
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>

        {/* recessive grid + y labels */}
        {gridVals.map((v) => (
          <g key={v}>
            <line x1={PAD.left} y1={y(v)} x2={W - PAD.right} y2={y(v)} stroke="var(--color-border)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill="var(--color-text-tertiary)" className="mono">
              {v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(v < 10 ? 1 : 0)}
            </text>
          </g>
        ))}

        {/* areas, then lines on top */}
        {series.map((s) => (
          <path key={`a-${s.key}`} d={areaPath(s.points)} fill={`url(#${uid}-${s.key})`} className="animate-area" />
        ))}
        {series.map((s) => (
          <path
            key={`l-${s.key}`}
            ref={(el) => {
              if (el) el.style.setProperty("--draw-length", String(el.getTotalLength()));
            }}
            d={linePath(s.points)}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            className="animate-draw"
          />
        ))}

        {/* x ticks */}
        {tickIdx.map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize={10} fill="var(--color-text-tertiary)" className="mono">
            {labels[i]}
          </text>
        ))}

        {/* hover crosshair + marks */}
        {hover != null && (
          <g>
            <line x1={x(hover)} y1={PAD.top} x2={x(hover)} y2={PAD.top + plotH} stroke="var(--color-border-strong)" strokeWidth={1} />
            {series.map((s) => (
              <circle key={s.key} cx={x(hover)} cy={y(s.points[hover] ?? 0)} r={3.5} fill="var(--color-surface-card)" stroke={s.color} strokeWidth={2} />
            ))}
          </g>
        )}
      </svg>

      {hover != null && (
        <div
          className="pointer-events-none absolute z-10 rounded-control border px-2.5 py-1.5 text-xs card-shadow"
          style={{
            borderColor: "var(--color-border-strong)",
            background: "var(--color-surface-raised)",
            left: `${(x(hover) / W) * 100}%`,
            top: 0,
            transform: `translateX(${hover > n / 2 ? "-105%" : "5%"})`,
          }}
        >
          <div className="mono mb-1" style={{ color: "var(--color-text-tertiary)" }}>
            {labels[hover]}
          </div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-2 whitespace-nowrap">
              <span className="inline-block rounded-full" style={{ width: 7, height: 7, background: s.color }} />
              <span style={{ color: "var(--color-text-secondary)" }}>{s.label}</span>
              <span className="mono ml-auto font-semibold">
                {(s.points[hover] ?? 0).toFixed(valueDigits)} {unit}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
