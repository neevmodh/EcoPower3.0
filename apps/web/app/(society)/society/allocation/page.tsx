import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { AllocationEditor } from "@/components/AllocationEditor";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Each unit's share of the society's common-area/shared-generation costs
// — a real, editable number (service_connections.allocation_pct, 0020),
// not a placeholder page. society_admin can edit; society_member (and any
// unit visible only via ownership) gets a read-only view — the RLS UPDATE
// policy only grants society_admin write, this just matches the UI to it.

export default async function SocietyAllocationPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user, roles } = scope;
  const canEdit = roles.includes("society_admin");

  const { data: units } = await supabase
    .from("service_connections")
    .select("id, consumer_number, allocation_pct")
    .order("consumer_number");

  const total = (units ?? []).reduce((sum, u) => sum + (u.allocation_pct ?? 0), 0);

  return (
    <PanelShell
      panel="society"
      email={user.email ?? ""}
      nav={[
        { href: "/society", label: "Overview" },
        { href: "/society/units", label: "Units" },
        { href: "/society/allocation", label: "Allocation", active: true },
      ]}
    >
      <h1 className="text-2xl font-semibold mb-1">Cost allocation</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        Each unit&apos;s share of common-area and shared-generation costs.
        {canEdit ? " Editable here — writes go through RLS, scoped to this society only." : " Read-only for this role."}
      </p>

      <div className="mb-6">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
          style={{
            borderColor: total === 100 ? "var(--color-status-good)" : "var(--color-status-warning)",
            color: total === 100 ? "var(--color-status-good)" : "var(--color-status-warning)",
          }}
        >
          {total}% allocated {total !== 100 && "— should total 100%"}
        </span>
      </div>

      <div className="space-y-3">
        {(units ?? []).map((u) => (
          <div
            key={u.id}
            className="rounded-card border card-shadow p-4 flex items-center justify-between"
            style={{ borderColor: "var(--color-border)" }}
          >
            <span className="font-medium text-sm tabular">{u.consumer_number}</span>
            {canEdit ? (
              <AllocationEditor unitId={u.id} initialPct={u.allocation_pct} />
            ) : (
              <span className="text-sm tabular" style={{ color: "var(--color-text-secondary)" }}>
                {u.allocation_pct != null ? `${u.allocation_pct}%` : "—"}
              </span>
            )}
          </div>
        ))}
        {(units ?? []).length === 0 && (
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            No units visible to this account.
          </p>
        )}
      </div>
    </PanelShell>
  );
}
