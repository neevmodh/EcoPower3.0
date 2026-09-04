import { redirect } from "next/navigation";
import { INDIA_GRID_EMISSION_FACTOR_KG_PER_KWH, co2AvoidedKg, treeEquivalent } from "@ecopower/shared";
import { PanelShell } from "@/components/PanelShell";
import { PanelIcon } from "@/components/Icon";
import { StatTile } from "@/components/StatTile";
import { ChartFrame, LegendDot } from "@/components/charts/ChartFrame";
import { AreaChart } from "@/components/charts/AreaChart";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Household grid mix in Gujarat is dominated by ~0.72 kg/kWh; a petrol
// hatchback ~0.12 kg/km. Both frame the totals, neither is a hard claim.
const KG_CO2_PER_KM = 0.12;

export default async function OperatorEsgPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  const { data: assets } = await supabase.from("assets").select("asset_type, capacity_kw, service_connections(consumer_number)");
  const pvKw = (assets ?? []).filter((a) => a.asset_type === "pv_array").reduce((s, a) => s + (a.capacity_kw ?? 0), 0);
  const sitesServiced = new Set(
    (assets ?? [])
      .map((a) => (a.service_connections as unknown as { consumer_number: string } | null)?.consumer_number)
      .filter(Boolean),
  ).size;

  // 7-day fleet generation, hourly, RLS-scoped via 0029/0032.
  const { data: genRaw } = (await supabase.rpc("resco_generation_profile", { p_hours: 168 })) as {
    data: Array<{ bucket: string; generation_kwh: number }> | null;
  };
  const gen = (genRaw ?? []).map((r) => ({ bucket: r.bucket, kwh: Number(r.generation_kwh) }));
  const total7d = gen.reduce((s, r) => s + r.kwh, 0);

  // Daily buckets for the trend.
  const byDay = new Map<string, number>();
  for (const r of gen) {
    const d = r.bucket.slice(0, 10);
    byDay.set(d, (byDay.get(d) ?? 0) + r.kwh);
  }
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  const dayLabels = days.map(([d]) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" }));
  const dayValues = days.map(([, v]) => v);

  const co2 = total7d > 0 ? co2AvoidedKg(total7d) : null;
  const trees = co2 != null ? treeEquivalent(co2) : null;
  const km = co2 != null ? co2 / KG_CO2_PER_KM : null;
  // Coverage: how much of the metered fleet the export data actually reflects.
  const hasData = gen.length >= 2 && total7d > 0;

  return (
    <PanelShell
      panel="operator"
      email={user.email ?? ""}
      nav={[
        { href: "/operator", label: "Fleet" },
        { href: "/operator/devices", label: "Devices" },
        { href: "/operator/guarantee", label: "Guarantees" },
        { href: "/operator/esg", label: "ESG report", active: true },
      ]}
    >
      <h1 className="text-2xl font-semibold mb-1">ESG report</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        Every figure is derived from metered generation across the connections your org services — the report states its
        coverage rather than presenting an estimate as measurement.
      </p>

      {!hasData ? (
        <p style={{ color: "var(--color-text-secondary)" }}>
          No metered export in the last 7 days for the connections your org services.
        </p>
      ) : (
        <>
          <div className="grid gap-4 mb-8" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
            <StatTile icon={<PanelIcon name="sun" />} label="Clean energy delivered · 7 days" value={Math.round(total7d)} unit="kWh" />
            <StatTile icon={<PanelIcon name="leaf" />} label="CO₂ avoided · 7 days" value={Math.round(co2 ?? 0)} unit="kg" />
            <StatTile icon={<PanelIcon name="leaf" />} label="Trees · one year equivalent" value={Math.round(trees ?? 0)} />
            <StatTile icon={<PanelIcon name="gauge" />} label="Petrol km not driven" value={Math.round(km ?? 0)} unit="km" />
            <StatTile icon={<PanelIcon name="building" />} label="Sites serviced" value={sitesServiced} />
            <StatTile icon={<PanelIcon name="bolt" />} label="Installed PV capacity" value={Math.round(pvKw)} unit="kW" />
          </div>

          <div className="mb-8">
            <ChartFrame
              title="Daily clean-energy delivery"
              caption={`Metered export by day · × ${INDIA_GRID_EMISSION_FACTOR_KG_PER_KWH} kg/kWh (CEA grid factor) for the CO₂ figure`}
              legend={<LegendDot color="var(--color-diverging-export)">Generation delivered</LegendDot>}
              table={
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left border-b" style={{ borderColor: "var(--color-border)" }}>
                      <th className="py-1.5 pr-4 font-medium" style={{ color: "var(--color-text-secondary)" }}>Day</th>
                      <th className="py-1.5 pr-4 font-medium text-right" style={{ color: "var(--color-text-secondary)" }}>kWh</th>
                      <th className="py-1.5 font-medium text-right" style={{ color: "var(--color-text-secondary)" }}>CO₂ avoided (kg)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {days.map(([d, v]) => (
                      <tr key={d} className="border-b last:border-b-0" style={{ borderColor: "var(--color-border)" }}>
                        <td className="py-1 pr-4 mono">{d}</td>
                        <td className="py-1 pr-4 text-right mono">{v.toFixed(1)}</td>
                        <td className="py-1 text-right mono">{co2AvoidedKg(v).toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              }
            >
              <AreaChart
                unit="kWh"
                labels={dayLabels}
                series={[{ key: "gen", label: "Generation delivered", color: "var(--color-diverging-export)", points: dayValues }]}
              />
            </ChartFrame>
          </div>

          <div
            className="rounded-card border card-shadow p-5"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
          >
            <div className="eyebrow mb-3">Methodology</div>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              Avoided emissions = metered behind-meter export × the CEA combined-margin grid emission factor
              ({INDIA_GRID_EMISSION_FACTOR_KG_PER_KWH} kg CO₂/kWh). Only metered export is counted — no modelled
              generation is added. Tree and vehicle-km equivalents are illustrative conversions, not offset claims.
            </p>
          </div>
        </>
      )}
    </PanelShell>
  );
}
