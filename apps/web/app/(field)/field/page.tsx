import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { WorkOrderActions } from "@/components/WorkOrderActions";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const STATUS_COLOR: Record<string, string> = {
  open: "var(--color-status-warning)",
  in_progress: "var(--color-categorical-consumption)",
  completed: "var(--color-status-good)",
  cancelled: "var(--color-text-secondary)",
};

const PRIORITY_COLOR: Record<string, string> = {
  low: "var(--color-text-secondary)",
  medium: "var(--color-categorical-consumption)",
  high: "var(--color-status-warning)",
  urgent: "var(--color-status-critical)",
};

export default async function FieldPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  // work_orders_resco_scope (0019) confines this to the technician's own
  // RESCO org — no WHERE clause on org is what makes that true, same
  // pattern meters_resco_scope (#18) established for the Operator panel.
  const { data: workOrders } = await supabase
    .from("work_orders")
    .select("id, title, description, priority, status, assigned_user_id, created_at, service_connections(consumer_number)")
    .order("created_at", { ascending: false });

  const openCount = (workOrders ?? []).filter((w) => w.status === "open" || w.status === "in_progress").length;

  return (
    <PanelShell
      panel="field"
      email={user.email ?? ""}
      nav={[{ href: "/field", label: "My jobs", active: true }]}
    >
      <h1 className="text-2xl font-semibold mb-1">Work orders</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        Assigned to you or unclaimed in your RESCO org — direct consumer data (billing, other meters) stays
        out of reach even here (P6: identity lives in the rail, not a widened data grant).
      </p>

      <div className="mb-6">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
        >
          {openCount} open
        </span>
      </div>

      {(workOrders ?? []).length === 0 ? (
        <div
          className="rounded-card border card-shadow p-6 text-center"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
        >
          No work orders right now.
        </div>
      ) : (
        <div className="space-y-3">
          {(workOrders ?? []).map((w) => {
            const sc = w.service_connections as unknown as { consumer_number: string } | null;
            return (
              <div key={w.id} className="rounded-card border card-shadow p-5" style={{ borderColor: "var(--color-border)" }}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="font-medium text-sm mb-0.5">{w.title}</div>
                    <div className="text-xs tabular" style={{ color: "var(--color-text-secondary)" }}>
                      Site {sc?.consumer_number ?? "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-medium" style={{ color: PRIORITY_COLOR[w.priority] }}>
                      {w.priority}
                    </span>
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium on-accent"
                      style={{ background: STATUS_COLOR[w.status] }}
                    >
                      {w.status.replace("_", " ")}
                    </span>
                  </div>
                </div>
                <p className="text-sm mb-4" style={{ color: "var(--color-text-secondary)" }}>
                  {w.description}
                </p>
                <WorkOrderActions workOrderId={w.id} status={w.status} isAssignedToMe={w.assigned_user_id === user.id} />
              </div>
            );
          })}
        </div>
      )}
    </PanelShell>
  );
}
