import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { PanelIcon, type IconName } from "@/components/Icon";
import { ChartFrame, LegendDot } from "@/components/charts/ChartFrame";
import { AreaChart } from "@/components/charts/AreaChart";
import { DonutChart, type DonutSlice } from "@/components/charts/DonutChart";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const ASSET_ICON: Record<string, IconName> = {
  pv_array: "sun",
  inverter: "plug",
  battery: "battery",
  acdb: "bolt",
};

const ASSET_COLOR: Record<string, string> = {
  pv_array: "var(--color-categorical-generation)",
  inverter: "var(--color-categorical-consumption)",
  battery: "var(--color-categorical-third)",
  acdb: "#b394ff",
};

export default async function OperatorPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  const { data: assets } = await supabase
    .from("assets")
    .select("id, asset_type, capacity_kw, commissioning_ref, service_connections(consumer_number)")
    .order("asset_type");

  const { data: meters } = await supabase.from("meters").select("id, status");

  // Fleet generation — hourly metered export across the connections this org
  // services, last 48h. RLS (meter_readings_resco_scope, 0029) via the
  // SECURITY INVOKER rollup (0032) is the scope.
  const { data: genRaw } = (await supabase.rpc("resco_generation_profile", { p_hours: 48 })) as {
    data: Array<{ bucket: string; generation_kwh: number; import_kwh: number; meters: number }> | null;
  };
  const gen = (genRaw ?? []).map((r) => ({ bucket: r.bucket, generationKwh: Number(r.generation_kwh) }));
  const genLabels = gen.map((r) =>
    new Date(r.bucket).toLocaleString("en-IN", { day: "numeric", hour: "2-digit", hour12: false }),
  );
  const genDay = gen.slice(-24).reduce((s, r) => s + r.generationKwh, 0);
  // Capacity factor = generation / (installed kW * hours). Rough, labelled.

  const totalCapacityKw = (assets ?? []).reduce((sum, a) => sum + (a.capacity_kw ?? 0), 0);
  const pvCapacityKw = (assets ?? [])
    .filter((a) => a.asset_type === "pv_array")
    .reduce((sum, a) => sum + (a.capacity_kw ?? 0), 0);
  const capacityFactor = pvCapacityKw > 0 && gen.length > 0 ? genDay / (pvCapacityKw * gen.slice(-24).length) : null;
  const byType = (assets ?? []).reduce<Record<string, number>>((acc, a) => {
    acc[a.asset_type] = (acc[a.asset_type] ?? 0) + 1;
    return acc;
  }, {});
  const activeMeters = (meters ?? []).filter((m) => m.status === "active").length;

  const capacityByType = (assets ?? []).reduce<Record<string, number>>((acc, a) => {
    acc[a.asset_type] = (acc[a.asset_type] ?? 0) + (a.capacity_kw ?? 0);
    return acc;
  }, {});
  const capacitySlices: DonutSlice[] = Object.entries(capacityByType)
    .filter(([, kw]) => kw > 0)
    .map(([type, kw]) => ({
      key: type,
      label: type.replace("_", " "),
      value: Math.round(kw),
      color: ASSET_COLOR[type] ?? "var(--color-text-tertiary)",
    }));

  return (
    <PanelShell
      panel="operator"
      email={user.email ?? ""}
      nav={[
        { href: "/operator", label: "Fleet", active: true },
        { href: "/operator/devices", label: "Devices" },
        { href: "/operator/guarantee", label: "Guarantees" },
        { href: "/operator/esg", label: "ESG report" },
      ]}
    >
      <h1 className="text-2xl font-semibold mb-1">Asset fleet</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        Equipment your org installed and services — scoped by RLS to your org_id, not a filter this query applies.
      </p>

      <div className="grid gap-4 mb-8" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
        <div className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Total assets</div>
          <div className="text-2xl font-semibold tabular">{(assets ?? []).length}</div>
        </div>
        <div className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Installed capacity</div>
          <div className="text-2xl font-semibold tabular">{totalCapacityKw.toFixed(0)} kW</div>
        </div>
        <div className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Active meters visible</div>
          <div className="text-2xl font-semibold tabular">{activeMeters}</div>
        </div>
        <div className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Fleet generation · 24h</div>
          <div className="text-2xl font-semibold tabular" style={{ color: "var(--color-diverging-export)" }}>
            {gen.length > 0 ? `${genDay.toFixed(0)} kWh` : "—"}
          </div>
        </div>
        <div className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Capacity factor · 24h (est.)</div>
          <div className="text-2xl font-semibold tabular">
            {capacityFactor != null ? `${(capacityFactor * 100).toFixed(1)}%` : "—"}
          </div>
        </div>
      </div>

      {gen.length >= 2 && (
        <div className="mb-8">
          <ChartFrame
            title="Fleet generation"
            caption="Hourly metered export across every connection your org services, last 48 hours"
            legend={<LegendDot color="var(--color-diverging-export)">Generation</LegendDot>}
            table={
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left border-b" style={{ borderColor: "var(--color-border)" }}>
                    <th className="py-1.5 pr-4 font-medium" style={{ color: "var(--color-text-secondary)" }}>Hour</th>
                    <th className="py-1.5 font-medium text-right" style={{ color: "var(--color-text-secondary)" }}>Generation (kWh)</th>
                  </tr>
                </thead>
                <tbody>
                  {gen
                    .slice()
                    .reverse()
                    .map((r) => (
                      <tr key={r.bucket} className="border-b last:border-b-0" style={{ borderColor: "var(--color-border)" }}>
                        <td className="py-1 pr-4 mono">{new Date(r.bucket).toLocaleString("en-GB")}</td>
                        <td className="py-1 text-right mono">{r.generationKwh.toFixed(2)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            }
          >
            <AreaChart
              unit="kWh"
              labels={genLabels}
              series={[
                {
                  key: "gen",
                  label: "Generation",
                  color: "var(--color-diverging-export)",
                  points: gen.map((r) => r.generationKwh),
                },
              ]}
            />
          </ChartFrame>
        </div>
      )}

      {capacitySlices.length > 0 && (
        <div className="mb-8">
          <ChartFrame title="Installed capacity by asset type" caption="Sums to the fleet total your org services">
            <DonutChart
              slices={capacitySlices}
              centerLabel="kW total"
              centerValue={`${Math.round(totalCapacityKw)}`}
              unit="kW"
            />
          </ChartFrame>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--color-border)" }}>
              <th className="py-2 pr-4 font-medium" style={{ color: "var(--color-text-secondary)" }}>Type</th>
              <th className="py-2 pr-4 font-medium" style={{ color: "var(--color-text-secondary)" }}>Site</th>
              <th className="py-2 pr-4 font-medium text-right" style={{ color: "var(--color-text-secondary)" }}>Capacity</th>
              <th className="py-2 font-medium" style={{ color: "var(--color-text-secondary)" }}>Commissioning ref</th>
            </tr>
          </thead>
          <tbody>
            {(assets ?? []).map((a) => {
              const sc = a.service_connections as unknown as { consumer_number: string } | null;
              return (
                <tr key={a.id} className="border-b last:border-b-0" style={{ borderColor: "var(--color-border)" }}>
                  <td className="py-2.5 pr-4">
                    <span className="inline-flex mr-1.5 align-middle" style={{ color: "var(--color-categorical-generation)" }}>
                      <PanelIcon name={ASSET_ICON[a.asset_type] ?? "box"} size={14} />
                    </span>
                    {a.asset_type.replace("_", " ")}
                  </td>
                  <td className="py-2.5 pr-4 tabular" style={{ color: "var(--color-text-secondary)" }}>{sc?.consumer_number ?? "—"}</td>
                  <td className="py-2.5 pr-4 text-right tabular">{a.capacity_kw != null ? `${a.capacity_kw} kW` : "—"}</td>
                  <td className="py-2.5 tabular" style={{ color: "var(--color-text-secondary)" }}>{a.commissioning_ref ?? "—"}</td>
                </tr>
              );
            })}
            {(assets ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center" style={{ color: "var(--color-text-secondary)" }}>
                  No assets visible to this account.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {Object.keys(byType).length > 0 && (
        <div className="flex gap-3 mt-6">
          {Object.entries(byType).map(([type, count]) => (
            <span
              key={type}
              className="rounded-full border px-3 py-1 text-xs font-medium"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
            >
              <span className="inline-flex align-middle mr-1.5" style={{ color: "var(--color-categorical-generation)" }}><PanelIcon name={ASSET_ICON[type] ?? "box"} size={13} /></span>{count} {type.replace("_", " ")}
            </span>
          ))}
        </div>
      )}
    </PanelShell>
  );
}
