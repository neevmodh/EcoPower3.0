import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { RankedBar, type RankedRow } from "@/components/charts/RankedBar";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// #89/#90: my_society_unit_ids() (0020) is the real gate — society_admin
// sees every unit in their org, society_member sees only their own. These
// queries have no WHERE clause on org/owner; RLS is what makes them correct.

export default async function SocietyPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  const { data: units } = await supabase
    .from("service_connections")
    .select("id, consumer_number, sanctioned_load_kw, allocation_pct")
    .order("consumer_number");

  // society_unit_consumption() (0021) aggregates in SQL — a plain
  // .select().in() fetch of raw meter_readings hit PostgREST's 1000-row cap.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: consumption } = (await supabase.rpc("society_unit_consumption", { p_since: since })) as {
    data: Array<{ service_connection_id: string; consumer_number: string; kwh: number }> | null;
  };

  const consByConn = new Map((consumption ?? []).map((c) => [c.service_connection_id, Number(c.kwh)]));
  const totalKwh = (consumption ?? []).reduce((sum, c) => sum + Number(c.kwh), 0);
  const totalSanctionedKw = (units ?? []).reduce((sum, u) => sum + (u.sanctioned_load_kw ?? 0), 0);
  const reporting = (units ?? []).filter((u) => consByConn.has(u.id)).length;
  const avgPerUnit = reporting > 0 ? totalKwh / reporting : null;

  const rows: RankedRow[] = (units ?? []).map((u) => {
    const kwh = consByConn.get(u.id) ?? 0;
    const heavy = avgPerUnit != null && kwh > avgPerUnit * 1.5;
    return {
      key: u.id,
      label: u.consumer_number,
      value: kwh,
      display: kwh > 0 ? `${kwh.toFixed(0)} kWh` : "—",
      color: heavy ? "var(--color-status-warning)" : undefined,
      note: u.allocation_pct != null ? `solar allocation ${u.allocation_pct}%` : undefined,
    };
  });

  return (
    <PanelShell
      panel="society"
      email={user.email ?? ""}
      nav={[
        { href: "/society", label: "Overview", active: true },
        { href: "/society/units", label: "Units" },
        { href: "/society/allocation", label: "Allocation" },
        { href: "/society/common", label: "Common area" },
      ]}
    >
      <h1 className="text-2xl font-semibold mb-1">Society overview</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        Aggregate consumption across every unit — per-unit billing stays owner-only, enforced structurally (no
        invoices/payments policy grants this role anything), not by hiding a column.
      </p>

      <div className="grid gap-4 mb-8" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
        <div className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Units</div>
          <div className="text-2xl font-semibold tabular">{(units ?? []).length}</div>
          <div className="text-[11px] mt-0.5 tabular" style={{ color: "var(--color-text-tertiary)" }}>
            {reporting} reporting
          </div>
        </div>
        <div className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Sanctioned load</div>
          <div className="text-2xl font-semibold tabular">{totalSanctionedKw.toFixed(0)} kW</div>
        </div>
        <div className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Consumption, 30d</div>
          <div className="text-2xl font-semibold tabular">{totalKwh > 0 ? `${totalKwh.toFixed(0)} kWh` : "—"}</div>
        </div>
        <div className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Avg per reporting unit</div>
          <div className="text-2xl font-semibold tabular">{avgPerUnit != null ? `${avgPerUnit.toFixed(0)} kWh` : "—"}</div>
        </div>
      </div>

      {(units ?? []).length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          No units linked to this society yet.
        </p>
      ) : totalKwh === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          No readings in the last 30 days for any unit.
        </p>
      ) : (
        <ChartFrame
          title="Consumption by unit · last 30 days"
          caption="From each unit's sub-meter. Units above 1.5× the society average are flagged."
          table={
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left border-b" style={{ borderColor: "var(--color-border)" }}>
                  <th className="py-1.5 pr-4 font-medium" style={{ color: "var(--color-text-secondary)" }}>Unit</th>
                  <th className="py-1.5 pr-4 font-medium text-right" style={{ color: "var(--color-text-secondary)" }}>30d kWh</th>
                  <th className="py-1.5 font-medium text-right" style={{ color: "var(--color-text-secondary)" }}>Solar alloc.</th>
                </tr>
              </thead>
              <tbody>
                {(units ?? []).map((u) => (
                  <tr key={u.id} className="border-b last:border-b-0" style={{ borderColor: "var(--color-border)" }}>
                    <td className="py-1 pr-4 mono">{u.consumer_number}</td>
                    <td className="py-1 pr-4 text-right mono">{(consByConn.get(u.id) ?? 0).toFixed(1)}</td>
                    <td className="py-1 text-right mono">{u.allocation_pct != null ? `${u.allocation_pct}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        >
          <RankedBar rows={rows} unit="kWh" accent="var(--color-categorical-third)" />
        </ChartFrame>
      )}
    </PanelShell>
  );
}
