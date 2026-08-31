import { redirect } from "next/navigation";
import { co2AvoidedKg, treeEquivalent, INDIA_GRID_EMISSION_FACTOR_KG_PER_KWH } from "@ecopower/shared";
import { PanelShell } from "@/components/PanelShell";
import { EnergyBarChart } from "@/components/EnergyBarChart";
import { CsvExportButton } from "@/components/CsvExportButton";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

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

  const rows = ((daily ?? []) as Array<{ day: string; import_kwh: number; export_kwh: number }>).map((d) => ({
    day: d.day,
    importKwh: Number(d.import_kwh),
    exportKwh: Number(d.export_kwh),
  }));

  const totalExportKwh = rows.reduce((sum, r) => sum + r.exportKwh, 0);
  const totalImportKwh = rows.reduce((sum, r) => sum + r.importKwh, 0);
  const co2Kg = co2AvoidedKg(totalExportKwh);
  const trees = treeEquivalent(co2Kg);

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
      nav={[
        { href: "/consumer", label: "My energy" },
        { href: "/consumer/bills", label: "Bills" },
        { href: "/consumer/plan", label: "Plan" },
        { href: "/consumer/analytics", label: "Analytics", active: true },
        { href: "/consumer/support", label: "Support" },
      ]}
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

          <div className="rounded-card border card-shadow p-5 mb-6" style={{ borderColor: "var(--color-border)" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Daily net grid exchange</h2>
              <CsvExportButton filename="ecopower-daily-energy.csv" rows={csvRows} />
            </div>
            <EnergyBarChart data={rows} />
          </div>

          <details className="rounded-card border card-shadow p-5" style={{ borderColor: "var(--color-border)" }}>
            <summary className="text-sm font-semibold cursor-pointer">Table view</summary>
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm">
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
                      <td className="py-1.5 pr-4 tabular">{r.day}</td>
                      <td className="py-1.5 pr-4 text-right tabular">{r.importKwh.toFixed(2)}</td>
                      <td className="py-1.5 text-right tabular">{r.exportKwh.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </PanelShell>
  );
}
