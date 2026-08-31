import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { TicketStatusSelect } from "@/components/TicketStatusSelect";
import { TicketThread } from "@/components/TicketThread";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// The resolution-side half of #86/#87: support_tickets_agent_select (0014)
// has granted a support_agent every ticket since that migration landed,
// but nothing rendered a queue for them — support_agent silently landed
// on /operator instead (lib/landing.ts's bug, fixed alongside this page).

const PRIORITY_COLOR: Record<string, string> = {
  low: "var(--color-text-secondary)",
  medium: "var(--color-categorical-consumption)",
  high: "var(--color-status-warning)",
  critical: "var(--color-status-critical)",
};

const STATUS_ORDER: Record<string, number> = { open: 0, in_progress: 1, resolved: 2, closed: 3 };

export default async function SupportQueuePage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  const { data: tickets } = await supabase
    .from("support_tickets")
    .select("id, subject, description, priority, status, created_at, service_connections(consumer_number)")
    .order("created_at", { ascending: false });

  const sorted = [...(tickets ?? [])].sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));

  const ticketIds = sorted.map((t) => t.id);
  const { data: allReplies } =
    ticketIds.length > 0
      ? await supabase
          .from("ticket_replies")
          .select("id, ticket_id, author_user_id, body, created_at")
          .in("ticket_id", ticketIds)
          .order("created_at")
      : { data: [] };

  const openCount = sorted.filter((t) => t.status === "open").length;

  return (
    <PanelShell
      panel="support"
      email={user.email ?? ""}
      nav={[{ href: "/support", label: "Queue", active: true }]}
    >
      <h1 className="text-2xl font-semibold mb-1">Support queue</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        Every ticket, across every DISCOM division and RESCO org — support_agent is the one role in this
        schema that isn&apos;t org/division-scoped, matching #86&apos;s own spec.
      </p>

      <div className="mb-6">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
        >
          {openCount} open
        </span>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          No tickets in the queue.
        </p>
      ) : (
        <div className="space-y-4">
          {sorted.map((t) => {
            const sc = t.service_connections as unknown as { consumer_number: string } | null;
            return (
              <div key={t.id} className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
                <div className="flex items-start justify-between mb-1 gap-3">
                  <div>
                    <span className="font-medium text-sm">{t.subject}</span>
                    <span className="ml-2 text-xs tabular" style={{ color: "var(--color-text-secondary)" }}>
                      {sc?.consumer_number ?? "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-medium" style={{ color: PRIORITY_COLOR[t.priority] }}>
                      {t.priority}
                    </span>
                    <TicketStatusSelect ticketId={t.id} status={t.status} />
                  </div>
                </div>
                <p className="text-sm mb-3" style={{ color: "var(--color-text-secondary)" }}>
                  {t.description}
                </p>
                <TicketThread
                  ticketId={t.id}
                  status={t.status}
                  currentUserId={user.id}
                  replies={(allReplies ?? []).filter((r) => r.ticket_id === t.id)}
                />
              </div>
            );
          })}
        </div>
      )}
    </PanelShell>
  );
}
