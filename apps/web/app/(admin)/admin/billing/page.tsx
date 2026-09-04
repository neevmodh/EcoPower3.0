import { redirect } from "next/navigation";
import { formatInrFromPaise } from "@ecopower/shared";
import { PanelShell } from "@/components/PanelShell";
import { AdminTable, type Column } from "@/components/AdminTable";
import { adminNav } from "@/lib/panelNav";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Row = {
  id: string;
  billing_period_start: string;
  billing_period_end: string;
  total_paise: number;
  estimated: boolean;
  engine_version: string;
  service_connections: unknown;
};

export default async function AdminBillingPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  const [{ data: invRaw }, { data: payments }] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "id, billing_period_start, billing_period_end, total_paise, estimated, engine_version, service_connections(consumer_number)",
      )
      .order("billing_period_end", { ascending: false })
      .limit(500),
    supabase.from("payments").select("amount_paise, status"),
  ]);

  const rows = (invRaw ?? []) as Row[];
  const cn = (r: Row) => (r.service_connections as { consumer_number: string } | null)?.consumer_number ?? "—";

  const invoiced = rows.reduce((s, r) => s + Number(r.total_paise), 0);
  const captured = (payments ?? [])
    .filter((p) => p.status === "captured")
    .reduce((s, p) => s + Number(p.amount_paise), 0);
  const failed = (payments ?? []).filter((p) => p.status === "failed").length;

  const columns: Column<Row>[] = [
    {
      key: "consumer",
      label: "Consumer",
      render: (r) => <span className="mono">{cn(r)}</span>,
      cell: cn,
    },
    {
      key: "period",
      label: "Period",
      render: (r) =>
        `${new Date(r.billing_period_start).toLocaleDateString("en-GB")} – ${new Date(r.billing_period_end).toLocaleDateString("en-GB")}`,
      cell: (r) => r.billing_period_end,
    },
    {
      key: "total_paise",
      label: "Amount",
      align: "right",
      render: (r) => <span className="mono">{formatInrFromPaise(BigInt(r.total_paise))}</span>,
      cell: (r) => String(r.total_paise),
    },
    {
      key: "estimated",
      label: "Basis",
      render: (r) => (
        <span style={{ color: r.estimated ? "var(--color-status-warning)" : "var(--color-status-good)" }}>
          {r.estimated ? "estimated read" : "metered"}
        </span>
      ),
      cell: (r) => (r.estimated ? "estimated" : "metered"),
    },
    { key: "engine_version", label: "Engine", render: (r) => <span className="mono text-xs">{r.engine_version}</span>, cell: (r) => r.engine_version },
  ];

  return (
    <PanelShell panel="admin" email={user.email ?? ""} nav={adminNav("/admin/billing")}>
      <h1 className="text-2xl font-semibold mb-1">Billing</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        Every issued invoice across every division. Invoices are append-only — this view is read-only by design, even for
        the platform operator.
      </p>

      <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>
        <Stat label="Invoiced (shown)" value={formatInrFromPaise(BigInt(invoiced))} />
        <Stat label="Collected (captured)" value={formatInrFromPaise(BigInt(captured))} />
        <Stat
          label="Collection efficiency"
          value={invoiced > 0 ? `${((captured / invoiced) * 100).toFixed(1)}%` : "—"}
        />
        <Stat label="Failed payments" value={String(failed)} tone={failed > 0 ? "var(--color-status-warning)" : undefined} />
      </div>

      <AdminTable rows={rows} columns={columns} searchPlaceholder="Search by consumer number…" />
    </PanelShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
      <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>
        {label}
      </div>
      <div className="text-xl font-semibold tabular" style={{ color: tone }}>
        {value}
      </div>
    </div>
  );
}
