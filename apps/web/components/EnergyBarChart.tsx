"use client";

// Diverging bar chart around a zero baseline — DESIGN.md §3.3/§4.2's form
// for net grid exchange, since import/export is one signed quantity, not
// two arbitrary series. Hand-rolled SVG per DESIGN.md §4.1 (2px marks, thin
// bars, recessive axis) — no charting library, same as every other chart
// in this repo. A table view sits alongside it, per §4.1's own rule that
// every chart needs one.

type DayPoint = { day: string; importKwh: number; exportKwh: number };

export function EnergyBarChart({ data }: { data: DayPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="text-sm py-8 text-center" style={{ color: "var(--color-text-secondary)" }}>
        No readings in this window.
      </p>
    );
  }

  const net = data.map((d) => d.exportKwh - d.importKwh);
  const maxAbs = Math.max(1, ...net.map((n) => Math.abs(n)));
  const width = 720;
  const height = 160;
  const barGap = 2;
  const barWidth = Math.max(1, width / data.length - barGap);
  const midY = height / 2;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height: 160 }} role="img" aria-label="Daily net grid exchange">
        <line x1={0} y1={midY} x2={width} y2={midY} stroke="var(--color-border)" strokeWidth={1} />
        {net.map((n, i) => {
          const barHeight = (Math.abs(n) / maxAbs) * (height / 2 - 8);
          const x = i * (barWidth + barGap);
          const isExport = n >= 0;
          const y = isExport ? midY - barHeight : midY;
          const tooltip = `${data[i].day}: ${n >= 0 ? "+" : ""}${n.toFixed(1)} kWh net ${isExport ? "export" : "import"}`;
          return (
            <rect
              key={data[i].day}
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(1, barHeight)}
              rx={1}
              fill={isExport ? "var(--color-diverging-export)" : "var(--color-diverging-import)"}
            >
              <title>{tooltip}</title>
            </rect>
          );
        })}
      </svg>
      <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: "var(--color-text-secondary)" }}>
        <span className="flex items-center gap-1.5">
          <span className="inline-block rounded-full" style={{ width: 8, height: 8, background: "var(--color-diverging-export)" }} />
          Net export
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block rounded-full" style={{ width: 8, height: 8, background: "var(--color-diverging-import)" }} />
          Net import
        </span>
        <span>
          {data[0].day} – {data[data.length - 1].day}
        </span>
      </div>
    </div>
  );
}
