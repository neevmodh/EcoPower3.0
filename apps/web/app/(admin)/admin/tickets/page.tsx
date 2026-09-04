import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { AdminTable, type Column } from "@/components/AdminTable";
import { adminNav } from "@/lib/panelNav";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Row = {
  id: string;
  subject: string;
  priority: string;
  status: string;
  created_at: string;
  service_connections: unknown;
};

const STATUS_TONE: Record<string, string> = {
  open: "var(--color-status-warning)",
  in_progress: "var(--color-categorical-third)",
  resolved: "var(--color-status-good)",
  closed: "var(--color-text-tertiary)",
};
const PRIORITY_TONE: Record<string, string> = {
  critical: "var(--color-status-serious)",
  high: "var(--color-status-warning)",
  medium: "var(--color-text-secondary)",
  low: "var(--color-text-tertiary)",
};

export default async function AdminTicketsPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  const { data } = await supabase
    .from("support_tickets")
    .select("id, subject, priority, status, created_at, service_connections(consumer_number)")
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = (data ?? []) as Row[];
  const cn = (r: Row) => (r.service_connections as { consumer_number: string } | null)?.consumer_number ?? "—";
  const open = rows.filter((r) => r.status === "open" || r.status === "in_progress").length;

  const columns: Column<Row>[] = [
    { key: "subject", label: "Subject", render: (r) => r.subject, cell: (r) => r.subject },
    { key: "consumer", label: "Consumer", render: (r) => <span className="mono">{cn(r)}</span>, cell: cn },
    {
      key: "priority",
      label: "Priority",
      render: (r) => <span style={{ color: PRIORITY_TONE[r.priority] }}>{r.priority}</span>,
      cell: (r) => r.priority,
    },
    {
      key: "status",
      label: "Status",
      render: (r) => <span style={{ color: STATUS_TONE[r.status] }}>{r.status.replace("_", " ")}</span>,
      cell: (r) => r.status,
    },
    {
      key: "created_at",
      label: "Opened",
      align: "right",
      render: (r) => <span className="mono text-xs">{new Date(r.created_at).toLocaleDateString("en-GB")}</span>,
      cell: (r) => r.created_at,
    },
  ];

  return (
    <PanelShell panel="admin" email={user.email ?? ""} nav={adminNav("/admin/tickets")}>
      <h1 className="text-2xl font-semibold mb-1">Support tickets</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        Every ticket across every division and RESCO. {open} open or in progress of {rows.length} shown.
      </p>
      <AdminTable rows={rows} columns={columns} searchPlaceholder="Search subject, consumer, status…" />
    </PanelShell>
  );
}
