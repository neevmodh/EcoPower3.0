import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// #89/#90: my_society_unit_ids() (0020) is the real gate — society_admin
// sees every unit in their org, society_member sees only their own. This
// query has no WHERE clause on org/owner; RLS is what makes it correct.

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
  // .select().in() fetch of raw meter_readings hit PostgREST's 1000-row
  // cap here (found live: 5 of 6 units silently showed 0 kWh) once a
  // society had more than one meter's worth of history.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: consumption } = (await supabase.rpc("society_unit_consumption", { p_since: since })) as {
    data: Array<{ service_connection_id: string; consumer_number: string; kwh: number }> | null;
  };

  const totalKwh = (consumption ?? []).reduce((sum, c) => sum + Number(c.kwh), 0);
  const totalSanctionedKw = (units ?? []).reduce((sum, u) => sum + (u.sanctioned_load_kw ?? 0), 0);

  return (
    <PanelShell
      panel="society"
      email={user.email ?? ""}
      nav={[
        { href: "/society", label: "Overview", active: true },
        { href: "/society/units", label: "Units" },
        { href: "/society/allocation", label: "Allocation" },
      ]}
    >
      <h1 className="text-2xl font-semibold mb-1">Society overview</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        Aggregate consumption across every unit — per-unit billing stays owner-only, enforced structurally
        (no invoices/payments policy grants this role anything), not by hiding a column.
      </p>

      <div className="grid gap-4 mb-8" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
        <div className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Units</div>
          <div className="text-2xl font-semibold tabular">{(units ?? []).length}</div>
        </div>
        <div className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Sanctioned load</div>
          <div className="text-2xl font-semibold tabular">{totalSanctionedKw.toFixed(0)} kW</div>
        </div>
        <div className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Consumption, 30d</div>
          <div className="text-2xl font-semibold tabular">{totalKwh.toFixed(0)} kWh</div>
        </div>
      </div>

      {(units ?? []).length === 0 && (
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          No units linked to this society yet.
        </p>
      )}
    </PanelShell>
  );
}
