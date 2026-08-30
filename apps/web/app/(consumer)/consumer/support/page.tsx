import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { SupportTicketForm } from "@/components/SupportTicketForm";
import { TicketThread } from "@/components/TicketThread";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

export default async function ConsumerSupportPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  const { data: connections } = await supabase.from("service_connections").select("id").order("consumer_number");
  const connectionId = connections?.[0]?.id;

  const { data: tickets } = connectionId
    ? await supabase
        .from("support_tickets")
        .select("id, subject, description, priority, status, created_at")
        .order("created_at", { ascending: false })
    : { data: [] };

  const ticketIds = (tickets ?? []).map((t) => t.id);
  const { data: allReplies } =
    ticketIds.length > 0
      ? await supabase
          .from("ticket_replies")
          .select("id, ticket_id, author_user_id, body, created_at")
          .in("ticket_id", ticketIds)
          .order("created_at")
      : { data: [] };

  return (
    <PanelShell
      panel="consumer"
      email={user.email ?? ""}
      nav={[
        { href: "/consumer", label: "My energy" },
        { href: "/consumer/bills", label: "Bills" },
        { href: "/consumer/plan", label: "Plan" },
        { href: "/consumer/analytics", label: "Analytics" },
        { href: "/consumer/support", label: "Support", active: true },
      ]}
    >
      <h1 className="text-2xl font-semibold mb-6">Support</h1>

      {!connectionId ? (
        <p style={{ color: "var(--color-text-secondary)" }}>No connection linked to this account yet.</p>
      ) : (
        <div className="grid gap-6" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.4fr)" }}>
          <SupportTicketForm serviceConnectionId={connectionId} />

          <div className="space-y-4">
            <h2 className="text-base font-semibold">Your tickets</h2>
            {(tickets ?? []).length === 0 ? (
              <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                No tickets raised yet.
              </p>
            ) : (
              (tickets ?? []).map((t) => (
                <div key={t.id} className="rounded-card border p-4" style={{ borderColor: "var(--color-border)" }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{t.subject}</span>
                    <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                      {STATUS_LABEL[t.status]}
                    </span>
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
              ))
            )}
          </div>
        </div>
      )}
    </PanelShell>
  );
}
