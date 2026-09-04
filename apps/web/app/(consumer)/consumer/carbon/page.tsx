import { redirect } from "next/navigation";
import { INDIA_GRID_EMISSION_FACTOR_KG_PER_KWH, co2AvoidedKg, treeEquivalent } from "@ecopower/shared";
import { PanelShell } from "@/components/PanelShell";
import { PanelIcon } from "@/components/Icon";
import { StatTile } from "@/components/StatTile";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { AreaChart } from "@/components/charts/AreaChart";
import { consumerNav } from "@/lib/panelNav";
import { getScope } from "@/lib/auth";
import { getLocale, getT } from "@/lib/i18n.server";
import { createClient } from "@/lib/supabase/server";

type DailyRow = { day: string; import_kwh: number; export_kwh: number };

// A petrol hatchback emits ~0.12 kg CO2/km (ARAI-style small-car figure) —
// used only to frame the avoided-emissions total, never as a precise claim.
const KG_CO2_PER_KM = 0.12;

export default async function ConsumerCarbonPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;
  const t = await getT();
  const locale = await getLocale();

  const { data: connections } = await supabase.from("service_connections").select("id");
  const connectionIds = (connections ?? []).map((c) => c.id);
  const { data: meter } =
    connectionIds.length > 0
      ? await supabase.from("meters").select("id").in("service_connection_id", connectionIds).limit(1).maybeSingle()
      : { data: null };

  const { data: dailyRaw } = meter
    ? await supabase.rpc("daily_energy_summary", { p_meter_id: meter.id, p_days: 180 })
    : { data: null };

  const daily = ((dailyRaw ?? []) as DailyRow[]).map((d) => ({
    day: d.day,
    exportKwh: Number(d.export_kwh),
  }));
  const exportSeries = daily.map((d) => d.exportKwh);
  const dayLabels = daily.map((d) => new Date(d.day).toLocaleDateString("en-IN", { day: "numeric", month: "short" }));

  const totalExport = exportSeries.reduce((a, b) => a + b, 0);
  const co2 = totalExport > 0 ? co2AvoidedKg(totalExport) : null;
  const trees = co2 != null ? treeEquivalent(co2) : null;
  const km = co2 != null ? co2 / KG_CO2_PER_KM : null;

  // Cumulative avoided-CO2 curve, for the trend.
  let running = 0;
  const cumulativeCo2 = exportSeries.map((v) => {
    running += co2AvoidedKg(v);
    return running;
  });

  const hasData = daily.length >= 2 && totalExport > 0;

  return (
    <PanelShell
      panel="consumer"
      email={user.email ?? ""}
      panelLabel={t("consumer.panelName")}
      signOutLabel={t("nav.signOut")}
      headerExtra={<LocaleSwitcher current={locale} />}
      nav={consumerNav("/consumer/carbon", t)}
    >
      <h1 className="text-2xl font-semibold mb-6">Carbon &amp; solar impact</h1>

      {!meter ? (
        <p style={{ color: "var(--color-text-secondary)" }}>
          No meter linked to this account yet — impact figures appear once readings arrive.
        </p>
      ) : !hasData ? (
        <p style={{ color: "var(--color-text-secondary)" }}>
          No solar export recorded in the last 180 days. This page shows CO₂ avoided from metered export only — it stays
          empty rather than estimating.
        </p>
      ) : (
        <>
          <div
            className="grid gap-4 mb-8"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
          >
            <StatTile icon={<PanelIcon name="leaf" />} label="CO₂ avoided · 180 days" value={Math.round(co2 ?? 0)} unit="kg" />
            <StatTile icon={<PanelIcon name="leaf" />} label="Trees absorbing · one year" value={Math.round(trees ?? 0)} />
            <StatTile icon={<PanelIcon name="gauge" />} label="Petrol km not driven" value={Math.round(km ?? 0)} unit="km" />
            <StatTile icon={<PanelIcon name="sun" />} label="Solar exported · 180 days" value={Math.round(totalExport)} unit="kWh" />
          </div>

          <div className="grid gap-5 mb-8" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
            <ChartFrame
              title="Cumulative CO₂ avoided"
              caption={`Running total from your metered export × ${INDIA_GRID_EMISSION_FACTOR_KG_PER_KWH} kg/kWh (CEA grid factor)`}
              table={
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left border-b" style={{ borderColor: "var(--color-border)" }}>
                      <th className="py-1.5 pr-4 font-medium" style={{ color: "var(--color-text-secondary)" }}>
                        Day
                      </th>
                      <th className="py-1.5 font-medium text-right" style={{ color: "var(--color-text-secondary)" }}>
                        Cumulative CO₂ (kg)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {daily.map((d, i) => (
                      <tr key={d.day} className="border-b last:border-b-0" style={{ borderColor: "var(--color-border)" }}>
                        <td className="py-1 pr-4 mono">{d.day}</td>
                        <td className="py-1 text-right mono">{cumulativeCo2[i].toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              }
            >
              <AreaChart
                unit="kg"
                labels={dayLabels}
                series={[
                  {
                    key: "co2",
                    label: "Cumulative CO₂ avoided",
                    color: "var(--color-diverging-export)",
                    points: cumulativeCo2,
                  },
                ]}
              />
            </ChartFrame>
          </div>

          <p className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
            Every figure is computed from your own metered generation and export — not an estimate. Grid emission factor
            from the CEA CO₂ Baseline Database ({INDIA_GRID_EMISSION_FACTOR_KG_PER_KWH} kg CO₂/kWh).
          </p>
        </>
      )}
    </PanelShell>
  );
}
