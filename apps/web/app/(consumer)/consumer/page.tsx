import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ConsumerPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  // No owner filter here either — RLS scopes it to this consumer's rows.
  const { data: connections } = await supabase
    .from("service_connections")
    .select("consumer_number, tariff_category, connection_type, sanctioned_load_kw");

  return (
    <PanelShell
      panel="consumer"
      email={user.email ?? ""}
      nav={[
        { href: "/consumer", label: "My energy", active: true },
        { href: "/consumer/bills", label: "Bills" },
        { href: "/consumer/plan", label: "Plan" },
      ]}
    >
      <h1 className="text-2xl font-semibold mb-6">My connections</h1>
      {(connections ?? []).length === 0 ? (
        <p style={{ color: "var(--color-text-secondary)" }}>
          No connection linked to this account yet.
        </p>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {(connections ?? []).map((c) => (
            <div
              key={c.consumer_number}
              className="rounded-card border p-4"
              style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
            >
              <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--color-text-secondary)" }}>
                {c.tariff_category} · {c.connection_type}
              </div>
              <div className="text-xl tabular">{c.consumer_number}</div>
              <div className="text-sm mt-2 tabular" style={{ color: "var(--color-text-secondary)" }}>
                {c.sanctioned_load_kw != null ? `${c.sanctioned_load_kw} kW sanctioned` : "—"}
              </div>
            </div>
          ))}
        </div>
      )}
    </PanelShell>
  );
}
