"use client";

import { useMemo, useState } from "react";

// Load by hour × day-of-week — DESIGN.md §4.2: two categorical dims plus
// magnitude → sequential heatmap. Fed by hourly_load_profile() (0025).
// Per-cell hover tooltip, hit target = the whole cell. Cells wipe in on a
// short diagonal stagger; nothing loops.

export type ProfileCell = { dow: number; hour: number; kwh: number; samples: number };

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS = DOW.map((name, idx) => ({ name, idx }));
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function LoadHeatmap({ cells, unit = "kWh" }: { cells: ProfileCell[]; unit?: string }) {
  const [hover, setHover] = useState<ProfileCell | null>(null);

  const { grid, max } = useMemo(() => {
    const g = new Map<string, ProfileCell>();
    let m = 0;
    for (const c of cells) {
      g.set(`${c.dow}-${c.hour}`, c);
      if (c.kwh > m) m = c.kwh;
    }
    return { grid: g, max: m || 1 };
  }, [cells]);

  // Sequential ramp on the consumption token — light track → full accent.
  const fill = (v: number) => {
    const t = Math.min(1, v / max);
    if (t === 0) return "var(--color-surface-sunken)";
    const pct = (8 + t * 80).toFixed(0);
    return `color-mix(in oklab, var(--color-categorical-consumption) ${pct}%, var(--color-surface-sunken))`;
  };

  return (
    <div className="relative">
      <div className="overflow-x-auto">
        <div className="inline-grid gap-[3px]" style={{ gridTemplateColumns: "34px repeat(24, minmax(15px, 1fr))", minWidth: 520 }}>
          <div />
          {HOURS.map((h) => (
            <div key={`col-${h}`} className="text-center mono text-[9px] pb-1" style={{ color: "var(--color-text-tertiary)" }}>
              {h % 6 === 0 ? h : ""}
            </div>
          ))}

          {DAYS.map(({ name: label, idx: dow }) => (
            <div key={label} className="contents">
              <div className="mono text-[10px] pr-2 flex items-center justify-end" style={{ color: "var(--color-text-tertiary)" }}>
                {label}
              </div>
              {HOURS.map((hour) => {
                const c = grid.get(`${dow}-${hour}`);
                const v = c?.kwh ?? 0;
                return (
                  <button
                    type="button"
                    key={`${dow}-${hour}`}
                    className="chart-cell aspect-square rounded-[3px] w-full transition-transform hover:scale-[1.35] hover:z-10 relative"
                    style={{
                      background: fill(v),
                      animationDelay: `${(dow + hour) * 12}ms`,
                      outline: hover && hover.dow === dow && hover.hour === hour ? "1.5px solid var(--color-text-primary)" : undefined,
                    }}
                    onMouseEnter={() => setHover(c ?? { dow, hour, kwh: 0, samples: 0 })}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(c ?? { dow, hour, kwh: 0, samples: 0 })}
                    onBlur={() => setHover(null)}
                    aria-label={`${label} ${hour}:00 — ${v.toFixed(2)} ${unit}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3 text-[10px] mono" style={{ color: "var(--color-text-tertiary)" }}>
        <span>0</span>
        <span
          className="h-2 w-28 rounded-full"
          style={{ background: "linear-gradient(90deg, var(--color-surface-sunken), var(--color-categorical-consumption))" }}
        />
        <span>{max.toFixed(1)} {unit} / hr</span>
      </div>

      {hover && (
        <div
          className="mt-2 text-xs rounded-control border px-2.5 py-1.5 inline-block"
          style={{ borderColor: "var(--color-border-strong)", background: "var(--color-surface-raised)" }}
        >
          <span className="mono" style={{ color: "var(--color-text-tertiary)" }}>
            {DOW[hover.dow]} {String(hover.hour).padStart(2, "0")}:00–{String((hover.hour + 1) % 24).padStart(2, "0")}:00
          </span>{" "}
          <span className="mono font-semibold ml-1">{hover.kwh.toFixed(2)} {unit}</span>
          {hover.samples > 0 && (
            <span className="ml-2" style={{ color: "var(--color-text-tertiary)" }}>
              · {hover.samples} reads
            </span>
          )}
        </div>
      )}
    </div>
  );
}
