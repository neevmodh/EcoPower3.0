import { AdminTable, type Column } from "@/components/AdminTable";
import { PanelShell } from "@/components/PanelShell";
import { ReconcileButton } from "@/components/ReconcileButton";
import { getScope } from "@/lib/auth";
import { adminNav } from "@/lib/panelNav";
import { createClient } from "@/lib/supabase/server";
import { formatInrFromPaise } from "@ecopower/shared";
import { redirect } from "next/navigation";

type EventRow = {
  id: string;
  event_type: string;
  created_at: string;
  processed_at: string | null;
};

type StuckOrderRow = {
  id: string;
  razorpay_order_id: string | null;
  amount_paise: number;
  status: string;
  created_at: string;
  service_connections: unknown;
};

export default async function AdminPaymentsPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  const [{ data: eventsRaw }, { data: stuckRaw }] = await Promise.all([
    supabase
      .from("webhook_events")
      .select("id, event_type, created_at, processed_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("payment_orders")
      .select(
        "id, razorpay_order_id, amount_paise, status, created_at, service_connections(consumer_number)",
      )
      .in("status", ["created", "attempted"])
      .order("created_at", { ascending: false }),
  ]);

  const events = (eventsRaw ?? []) as EventRow[];
  const stuck = (stuckRaw ?? []) as StuckOrderRow[];
  const cn = (r: StuckOrderRow) =>
    (r.service_connections as { consumer_number: string } | null)
      ?.consumer_number ?? "—";

  const eventColumns: Column<EventRow>[] = [
    {
      key: "event_type",
      label: "Event",
      render: (r) => <span className="mono text-xs">{r.event_type}</span>,
      cell: (r) => r.event_type,
    },
    {
      key: "created_at",
      label: "Received",
      render: (r) => new Date(r.created_at).toLocaleString("en-IN"),
      cell: (r) => r.created_at,
    },
    {
      key: "processed_at",
      label: "Processed",
      render: (r) =>
        r.processed_at ? new Date(r.processed_at).toLocaleString("en-IN") : "—",
      cell: (r) => r.processed_at ?? "",
    },
    {
      key: "signature_valid",
      label: "Signature",
      // Every Razorpay-delivered row here passed HMAC verification before
      // insert (0011) — an unsigned or mis-signed delivery is rejected with
      // 401 and never reaches this table. "manual.reconcile" rows are the
      // one exception: they're written by an admin action (#41), never a
      // signed delivery, and must not be badged as if they were.
      render: (r) =>
        r.event_type === "manual.reconcile" ? (
          <span style={{ color: "var(--color-text-secondary)" }}>
            manual reconcile
          </span>
        ) : (
          <span style={{ color: "var(--color-status-good)" }}>valid</span>
        ),
      cell: (r) =>
        r.event_type === "manual.reconcile" ? "manual reconcile" : "valid",
    },
  ];

  const stuckColumns: Column<StuckOrderRow>[] = [
    {
      key: "consumer",
      label: "Consumer",
      render: (r) => <span className="mono">{cn(r)}</span>,
      cell: cn,
    },
    {
      key: "amount_paise",
      label: "Amount",
      align: "right",
      render: (r) => (
        <span className="mono">
          {formatInrFromPaise(BigInt(r.amount_paise))}
        </span>
      ),
      cell: (r) => String(r.amount_paise),
    },
    {
      key: "status",
      label: "Status",
      render: (r) => r.status,
      cell: (r) => r.status,
    },
    {
      key: "created_at",
      label: "Created",
      render: (r) => new Date(r.created_at).toLocaleString("en-IN"),
      cell: (r) => r.created_at,
    },
    {
      key: "action",
      label: "",
      render: (r) => <ReconcileButton paymentOrderId={r.id} />,
      cell: () => "",
    },
  ];

  return (
    <PanelShell
      panel="admin"
      email={user.email ?? ""}
      nav={adminNav("/admin/payments")}
    >
      <h1 className="text-2xl font-semibold mb-1">Payment reconciliation</h1>
      <p
        className="text-sm mb-6"
        style={{ color: "var(--color-text-secondary)" }}
      >
        The webhook is the durable source of truth for a captured payment — this
        screen shows exactly what it recorded, and lets you re-fetch from
        Razorpay directly for any order still stuck if a delivery was ever lost.
      </p>

      {stuck.length > 0 && (
        <>
          <h2
            className="text-sm font-semibold mb-2"
            style={{ color: "var(--color-status-warning)" }}
          >
            Stuck orders ({stuck.length})
          </h2>
          <div className="mb-8">
            <AdminTable
              rows={stuck}
              columns={stuckColumns}
              searchPlaceholder="Search by consumer number…"
            />
          </div>
        </>
      )}

      <h2 className="text-sm font-semibold mb-2">Webhook deliveries</h2>
      <AdminTable
        rows={events}
        columns={eventColumns}
        searchPlaceholder="Search by event type…"
      />
    </PanelShell>
  );
}
