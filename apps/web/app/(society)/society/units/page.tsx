import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function SocietyUnitsPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  const { data: units } = await supabase
    .from("service_connections")
    .select("id, consumer_number, sanctioned_load_kw, connected_load_kw, allocation_pct, phase")
    .order("consumer_number");

  // society_unit_consumption() (0021) — aggregated in SQL to avoid the
  // PostgREST 1000-row cap a raw meter_readings fetch hit here live.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: consumption } = (await supabase.rpc("society_unit_consumption", { p_since: since })) as {
    data: Array<{ service_connection_id: string; consumer_number: string; kwh: number }> | null;
  };

  const consumptionByUnit = new Map<string, number>();
  for (const c of consumption ?? []) {
    consumptionByUnit.set(c.service_connection_id, Number(c.kwh));
  }

  return (
    <PanelShell
      panel="society"
      email={user.email ?? ""}
      nav={[
        { href: "/society", label: "Overview" },
        { href: "/society/units", label: "Units", active: true },
        { href: "/society/allocation", label: "Allocation" },
        { href: "/society/common", label: "Common area" },
      ]}
    >
      <h1 className="text-2xl font-semibold mb-1">Units</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        30-day consumption is a real sum of this account&apos;s RLS-visible meter reads — not estimated.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--color-border)" }}>
              <th className="py-2 pr-4 font-medium" style={{ color: "var(--color-text-secondary)" }}>Unit</th>
              <th className="py-2 pr-4 font-medium" style={{ color: "var(--color-text-secondary)" }}>Phase</th>
              <th className="py-2 pr-4 font-medium text-right" style={{ color: "var(--color-text-secondary)" }}>Sanctioned</th>
              <th className="py-2 pr-4 font-medium text-right" style={{ color: "var(--color-text-secondary)" }}>Allocation</th>
              <th className="py-2 font-medium text-right" style={{ color: "var(--color-text-secondary)" }}>30d consumption</th>
            </tr>
          </thead>
          <tbody>
            {(units ?? []).map((u) => (
              <tr key={u.id} className="border-b last:border-b-0" style={{ borderColor: "var(--color-border)" }}>
                <td className="py-2.5 pr-4 tabular font-medium">{u.consumer_number}</td>
                <td className="py-2.5 pr-4" style={{ color: "var(--color-text-secondary)" }}>{u.phase}</td>
                <td className="py-2.5 pr-4 text-right tabular">{u.sanctioned_load_kw ?? "—"} kW</td>
                <td className="py-2.5 pr-4 text-right tabular">{u.allocation_pct != null ? `${u.allocation_pct}%` : "—"}</td>
                <td className="py-2.5 text-right tabular">{(consumptionByUnit.get(u.id) ?? 0).toFixed(1)} kWh</td>
              </tr>
            ))}
            {(units ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center" style={{ color: "var(--color-text-secondary)" }}>
                  No units visible to this account.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </PanelShell>
  );
}
