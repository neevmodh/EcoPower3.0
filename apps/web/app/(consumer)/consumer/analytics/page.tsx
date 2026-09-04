import { redirect } from "next/navigation";
import { co2AvoidedKg, treeEquivalent, INDIA_GRID_EMISSION_FACTOR_KG_PER_KWH } from "@ecopower/shared";
import { PanelShell } from "@/components/PanelShell";
import { consumerNav } from "@/lib/panelNav";
import { EnergyBarChart } from "@/components/EnergyBarChart";
import { CsvExportButton } from "@/components/CsvExportButton";
import { ChartFrame, LegendDot } from "@/components/charts/ChartFrame";
import { AreaChart } from "@/components/charts/AreaChart";
import { LoadHeatmap, type ProfileCell } from "@/components/charts/LoadHeatmap";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type ProfileRow = { dow: number; hour: number; avg_import_kwh: number; avg_export_kwh: number; samples: number };
const DOW_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function ConsumerAnalyticsPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  const { data: connections } = await supabase.from("service_connections").select("id").order("consumer_number");
  const connectionId = connections?.[0]?.id;

  const { data: meter } = connectionId
    ? await supabase.from("meters").select("id").eq("service_connection_id", connectionId).maybeSingle()
    : { data: null };

  const { data: daily } = meter
    ? await supabase.rpc("daily_energy_summary", { p_meter_id: meter.id, p_days: 90 })
    : { data: null };
  const { data: profileRaw } = meter
    ? await supabase.rpc("hourly_load_profile", { p_meter_id: meter.id, p_days: 28 })
    : { data: null };

  const rows = ((daily ?? []) as Array<{ day: string; import_kwh: number; export_kwh: number }>).map((d) => ({
    day: d.day,
    importKwh: Number(d.import_kwh),
    exportKwh: Number(d.export_kwh),
  }));

  const profileCells: ProfileCell[] = ((profileRaw ?? []) as ProfileRow[]).map((r) => ({
    dow: r.dow,
    hour: r.hour,
    kwh: Number(r.avg_import_kwh),
    samples: Number(r.samples),
  }));
  const dayLabels = rows.map((r) => new Date(r.day).toLocaleDateString("en-IN", { day: "numeric", month: "short" }));

  const totalExportKwh = rows.reduce((sum, r) => sum + r.exportKwh, 0);
  const totalImportKwh = rows.reduce((sum, r) => sum + r.importKwh, 0);
  const co2Kg = co2AvoidedKg(totalExportKwh);
  const trees = treeEquivalent(co2Kg);

  // Month-over-month grid import, from the same daily reads. Only compared
  // when both months are fully covered by the 90-day window — a partial
  // first month would understate it and read as a fake "you saved 40%".
  const byMonth = new Map<string, { import: number; days: number }>();
  for (const r of rows) {
    const key = r.day.slice(0, 7); // YYYY-MM
    const m = byMonth.get(key) ?? { import: 0, days: 0 };
    m.import += r.importKwh;
    m.days += 1;
    byMonth.set(key, m);
  }
  const monthKeys = [...byMonth.keys()].sort();
  const daysIn = (ym: string) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
  const completeMonths = monthKeys.filter((k) => (byMonth.get(k)?.days ?? 0) >= daysIn(k) - 1);
  const momPair =
    completeMonths.length >= 2
      ? (() => {
          const prev = completeMonths[completeMonths.length - 2];
          const curr = completeMonths[completeMonths.length - 1];
          const p = byMonth.get(prev)?.import ?? 0;
          const c = byMonth.get(curr)?.import ?? 0;
          return { prev, curr, prevKwh: p, currKwh: c, deltaPct: p > 0 ? ((c - p) / p) * 100 : null };
        })()
      : null;
  const monthLabel = (ym: string) =>
    new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });

  const csvRows = rows.map((r) => ({
    day: r.day,
    import_kwh: r.importKwh.toFixed(3),
    export_kwh: r.exportKwh.toFixed(3),
    net_kwh: (r.exportKwh - r.importKwh).toFixed(3),
  }));

  return (
    <PanelShell
      panel="consumer"
      email={user.email ?? ""}
      nav={consumerNav("/consumer/analytics")}
    >
      <h1 className="text-2xl font-semibold mb-1">Analytics</h1>
      <p className="text-sm mb-8" style={{ color: "var(--color-text-secondary)" }}>
        Last 90 days, computed from your actual meter reads — not a synthetic trend.
      </p>

      {!meter ? (
        <p style={{ color: "var(--color-text-secondary)" }}>No meter commissioned yet.</p>
      ) : rows.length === 0 ? (
        <p style={{ color: "var(--color-text-secondary)" }}>No readings in this window.</p>
      ) : (
        <>
          <div className="grid gap-4 mb-8" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
            <div className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
              <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Solar exported</div>
              <div className="text-2xl font-semibold tabular" style={{ color: "var(--color-diverging-export)" }}>{totalExportKwh.toFixed(0)} kWh</div>
            </div>
            <div className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
              <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Grid imported</div>
              <div className="text-2xl font-semibold tabular" style={{ color: "var(--color-diverging-import)" }}>{totalImportKwh.toFixed(0)} kWh</div>
            </div>
            <div className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
              <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>CO₂ avoided</div>
              <div className="text-2xl font-semibold tabular" style={{ color: "var(--color-categorical-third)" }}>{co2Kg.toFixed(0)} kg</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                CEA combined-margin factor, {INDIA_GRID_EMISSION_FACTOR_KG_PER_KWH} kg/kWh
              </div>
            </div>
            <div className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
              <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Tree-years equivalent</div>
              <div className="text-2xl font-semibold tabular">{trees.toFixed(0)}</div>
            </div>
          </div>

          {momPair && (
            <div className="rounded-card border card-shadow p-5 mb-6" style={{ borderColor: "var(--color-border)" }}>
              <h2 className="text-base font-semibold mb-3">Grid import, month over month</h2>
              <div className="flex items-end gap-6">
                <div>
                  <div className="text-xs" style={{ color: "var(--color-text-secondary)" }}>{monthLabel(momPair.prev)}</div>
                  <div className="text-xl tabular">{momPair.prevKwh.toFixed(0)} kWh</div>
                </div>
                <div className="text-sm" style={{ color: "var(--color-text-secondary)" }}>→</div>
                <div>
                  <div className="text-xs" style={{ color: "var(--color-text-secondary)" }}>{monthLabel(momPair.curr)}</div>
                  <div className="text-xl tabular">{momPair.currKwh.toFixed(0)} kWh</div>
                </div>
                {momPair.deltaPct != null && (
                  <div
                    className="text-sm font-semibold tabular"
                    style={{ color: momPair.deltaPct <= 0 ? "var(--color-status-good)" : "var(--color-status-warning)" }}
                  >
                    {momPair.deltaPct > 0 ? "+" : ""}
                    {momPair.deltaPct.toFixed(1)}%
                  </div>
                )}
              </div>
              <p className="text-xs mt-3" style={{ color: "var(--color-text-secondary)" }}>
                Both months fully covered by the 90-day read window. Partial months are excluded so this can't read as a
                headline number it hasn't earned.
              </p>
            </div>
          )}

          <div className="grid gap-5 mb-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
            <ChartFrame
              title="Grid import vs solar export"
              caption="Daily totals, last 90 days"
              legend={
                <>
                  <LegendDot color="var(--color-diverging-import)">Grid import</LegendDot>
                  <LegendDot color="var(--color-diverging-export)">Solar export</LegendDot>
                </>
              }
              table={
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left border-b" style={{ borderColor: "var(--color-border)" }}>
                      <th className="py-1.5 pr-4 font-medium" style={{ color: "var(--color-text-secondary)" }}>Day</th>
                      <th className="py-1.5 pr-4 font-medium text-right" style={{ color: "var(--color-text-secondary)" }}>Import (kWh)</th>
                      <th className="py-1.5 font-medium text-right" style={{ color: "var(--color-text-secondary)" }}>Export (kWh)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice().reverse().map((r) => (
                      <tr key={r.day} className="border-b last:border-b-0" style={{ borderColor: "var(--color-border)" }}>
                        <td className="py-1 pr-4 mono">{r.day}</td>
                        <td className="py-1 pr-4 text-right mono">{r.importKwh.toFixed(2)}</td>
                        <td className="py-1 text-right mono">{r.exportKwh.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              }
            >
              <AreaChart
                unit="kWh"
                labels={dayLabels}
                series={[
                  { key: "imp", label: "Grid import", color: "var(--color-diverging-import)", points: rows.map((r) => r.importKwh) },
                  { key: "exp", label: "Solar export", color: "var(--color-diverging-export)", points: rows.map((r) => r.exportKwh) },
                ]}
              />
            </ChartFrame>

            {profileCells.length > 0 && (
              <ChartFrame
                title="When you draw from the grid"
                caption="Average grid import by hour and weekday, last 4 weeks"
                table={
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left border-b" style={{ borderColor: "var(--color-border)" }}>
                        <th className="py-1.5 pr-4 font-medium" style={{ color: "var(--color-text-secondary)" }}>Weekday</th>
                        <th className="py-1.5 pr-4 font-medium" style={{ color: "var(--color-text-secondary)" }}>Hour</th>
                        <th className="py-1.5 font-medium text-right" style={{ color: "var(--color-text-secondary)" }}>Avg import (kWh)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profileCells
                        .filter((c) => c.kwh > 0)
                        .sort((a, b) => b.kwh - a.kwh)
                        .slice(0, 16)
                        .map((c) => (
                          <tr key={`${c.dow}-${c.hour}`} className="border-b last:border-b-0" style={{ borderColor: "var(--color-border)" }}>
                            <td className="py-1 pr-4 mono">{DOW_LABEL[c.dow]}</td>
                            <td className="py-1 pr-4 mono">{String(c.hour).padStart(2, "0")}:00</td>
                            <td className="py-1 text-right mono">{c.kwh.toFixed(2)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                }
              >
                <LoadHeatmap cells={profileCells} />
              </ChartFrame>
            )}
          </div>

          <ChartFrame
            title="Daily net grid exchange"
            caption="Export minus import per day — a signed quantity around zero"
            filters={<CsvExportButton filename="ecopower-daily-energy.csv" rows={csvRows} />}
            table={
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left border-b" style={{ borderColor: "var(--color-border)" }}>
                    <th className="py-1.5 pr-4 font-medium" style={{ color: "var(--color-text-secondary)" }}>Day</th>
                    <th className="py-1.5 pr-4 font-medium text-right" style={{ color: "var(--color-text-secondary)" }}>Import (kWh)</th>
                    <th className="py-1.5 font-medium text-right" style={{ color: "var(--color-text-secondary)" }}>Export (kWh)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice().reverse().map((r) => (
                    <tr key={r.day} className="border-b last:border-b-0" style={{ borderColor: "var(--color-border)" }}>
                      <td className="py-1 pr-4 mono">{r.day}</td>
                      <td className="py-1 pr-4 text-right mono">{r.importKwh.toFixed(2)}</td>
                      <td className="py-1 text-right mono">{r.exportKwh.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          >
            <EnergyBarChart data={rows} />
          </ChartFrame>
        </>
      )}
    </PanelShell>
  );
}
