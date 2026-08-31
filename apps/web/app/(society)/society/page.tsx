import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function SocietyPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  const { data: orgs } = await supabase.from("orgs").select("id, name, type");

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
      <h1 className="text-2xl font-semibold mb-2">Society overview</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        Units and aggregate consumption. Per-unit invoice lines are owner-only —
        enforced structurally, not by hiding a column.
      </p>
      <ul className="space-y-2">
        {(orgs ?? []).map((o) => (
          <li key={o.id} className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
            <span className="font-medium">{o.name}</span>
            <span className="text-sm ml-2" style={{ color: "var(--color-text-secondary)" }}>{o.type}</span>
          </li>
        ))}
        {(orgs ?? []).length === 0 && (
          <li style={{ color: "var(--color-text-secondary)" }}>No society scoped to this account yet.</li>
        )}
      </ul>
    </PanelShell>
  );
}
