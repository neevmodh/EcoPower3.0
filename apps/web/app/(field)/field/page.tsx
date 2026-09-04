import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { PanelIcon } from "@/components/Icon";
import { StatTile } from "@/components/StatTile";
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

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

type WorkOrder = {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  assigned_user_id: string | null;
  created_at: string;
  completed_at: string | null;
  service_connections: unknown;
};

function WorkOrderRow({ w, userId }: { w: WorkOrder; userId: string }) {
  const sc = w.service_connections as { consumer_number: string } | null;
  const mine = w.assigned_user_id === userId;
  return (
    <div
      className="rounded-card border card-shadow p-5"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{w.title}</span>
            {mine && (
              <span className="mono text-[10px] rounded-full px-2 py-0.5" style={{ background: "var(--color-surface-sunken)", color: "var(--color-text-secondary)" }}>
                yours
              </span>
            )}
          </div>
          <div className="mono text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
            Site {sc?.consumer_number ?? "—"} · raised{" "}
            <span suppressHydrationWarning>{new Date(w.created_at).toLocaleDateString("en-GB")}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-medium" style={{ color: PRIORITY_COLOR[w.priority] }}>
            {w.priority}
          </span>
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium on-accent"
            style={{ background: STATUS_COLOR[w.status] }}
          >
            {w.status.replace("_", " ")}
          </span>
        </div>
      </div>
      <p className="text-sm mb-4" style={{ color: "var(--color-text-secondary)" }}>
        {w.description}
      </p>
      <WorkOrderActions workOrderId={w.id} status={w.status} isAssignedToMe={mine} />
    </div>
  );
}

export default async function FieldPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  // work_orders_resco_scope (0019) confines this to the technician's own
  // RESCO org — no WHERE clause on org is what makes that true.
  const { data } = await supabase
    .from("work_orders")
    .select(
      "id, title, description, priority, status, assigned_user_id, created_at, completed_at, service_connections(consumer_number)",
    )
    .order("created_at", { ascending: false });

  const workOrders = (data ?? []) as WorkOrder[];

  const active = workOrders
    .filter((w) => w.status === "open" || w.status === "in_progress")
    .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9));
  const done = workOrders.filter((w) => w.status === "completed");

  const todayStr = new Date().toDateString();
  const completedToday = done.filter((w) => w.completed_at && new Date(w.completed_at).toDateString() === todayStr).length;
  const mineOpen = active.filter((w) => w.assigned_user_id === user.id).length;
  const urgent = active.filter((w) => w.priority === "urgent").length;

  return (
    <PanelShell panel="field" email={user.email ?? ""} nav={[{ href: "/field", label: "My jobs", active: true }]}>
      <h1 className="text-2xl font-semibold mb-1">Work orders</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        Assigned to you or unclaimed in your RESCO org. Direct consumer data (billing, other meters) stays out of reach
        even here — identity lives in the rail, not a widened data grant.
      </p>

      <div className="grid gap-4 mb-8" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
        <StatTile icon={<PanelIcon name="wrench" />} label="Active" value={active.length} />
        <StatTile icon={<PanelIcon name="pin" />} label="Assigned to you" value={mineOpen} />
        <StatTile
          icon={<PanelIcon name="alert" />}
          label="Urgent"
          value={urgent}
          state={urgent > 0 ? "warning" : undefined}
        />
        <StatTile icon={<PanelIcon name="check" />} label="Completed today" value={completedToday} />
      </div>

      <h2 className="text-base font-semibold mb-3">Needs attention</h2>
      {active.length === 0 ? (
        <div
          className="rounded-card border card-shadow p-6 text-center mb-8"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
        >
          Nothing open. New work orders arrive here the moment they're raised.
        </div>
      ) : (
        <div className="space-y-3 mb-8">
          {active.map((w) => (
            <WorkOrderRow key={w.id} w={w} userId={user.id} />
          ))}
        </div>
      )}

      {done.length > 0 && (
        <>
          <h2 className="text-base font-semibold mb-3">Recently completed</h2>
          <div className="space-y-3">
            {done.slice(0, 8).map((w) => (
              <WorkOrderRow key={w.id} w={w} userId={user.id} />
            ))}
          </div>
        </>
      )}
    </PanelShell>
  );
}
