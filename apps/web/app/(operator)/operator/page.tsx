import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function OperatorPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  const { data: assets } = await supabase
    .from("assets")
    .select("id, asset_type, capacity_kw, commissioning_ref");

  return (
    <PanelShell
      panel="operator"
      email={user.email ?? ""}
      nav={[
        { href: "/operator", label: "Fleet", active: true },
        { href: "/operator/alerts", label: "Alerts" },
        { href: "/operator/work-orders", label: "Work orders" },
      ]}
    >
      <h1 className="text-2xl font-semibold mb-6">Asset fleet</h1>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left" style={{ color: "var(--color-text-secondary)" }}>
            <th className="py-2 font-medium">Type</th>
            <th className="py-2 font-medium text-right">Capacity</th>
            <th className="py-2 font-medium">Commissioning ref</th>
          </tr>
        </thead>
        <tbody>
          {(assets ?? []).map((a) => (
            <tr key={a.id} className="border-t" style={{ borderColor: "var(--color-border)" }}>
              <td className="py-2">{a.asset_type}</td>
              <td className="py-2 text-right tabular">{a.capacity_kw != null ? `${a.capacity_kw} kW` : "—"}</td>
              <td className="py-2 tabular">{a.commissioning_ref ?? "—"}</td>
            </tr>
          ))}
          {(assets ?? []).length === 0 && (
            <tr><td colSpan={3} className="py-6 text-center" style={{ color: "var(--color-text-secondary)" }}>
              No assets visible to this account.
            </td></tr>
          )}
        </tbody>
      </table>
    </PanelShell>
  );
}
