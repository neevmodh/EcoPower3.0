import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function FieldPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  return (
    <PanelShell
      panel="field"
      email={user.email ?? ""}
      nav={[
        { href: "/field", label: "My jobs", active: true },
        { href: "/field/scan", label: "Scan meter" },
      ]}
    >
      <h1 className="text-2xl font-semibold mb-2">Assigned work orders</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        Technician access is time-and-status-bounded, not geographic — a connection
        is readable only while an assigned work order is open on it.
      </p>
      <div
        className="rounded-card border p-6 text-center"
        style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
      >
        No open work orders. The <code>work_orders</code> table lands with the DISCOM
        panel (#26/#27); this shell is wired and waiting for it.
      </div>
    </PanelShell>
  );
}
