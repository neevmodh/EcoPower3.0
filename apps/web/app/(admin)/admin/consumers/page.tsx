import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { AdminTable, type Column } from "@/components/AdminTable";
import { adminNav } from "@/lib/panelNav";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Row = {
  id: string;
  consumer_number: string;
  tariff_category: string;
  connection_type: string;
  phase: string;
  sanctioned_load_kw: number | null;
  distribution_transformers: unknown;
  meters: unknown;
};

export default async function AdminConsumersPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  const { data } = await supabase
    .from("service_connections")
    .select(
      "id, consumer_number, tariff_category, connection_type, phase, sanctioned_load_kw, distribution_transformers(name), meters(status)",
    )
    .order("consumer_number");

  const rows = (data ?? []) as Row[];

  const columns: Column<Row>[] = [
    { key: "consumer_number", label: "Consumer", render: (r) => <span className="mono">{r.consumer_number}</span>, cell: (r) => r.consumer_number },
    {
      key: "dt",
      label: "DT",
      render: (r) => (r.distribution_transformers as { name: string } | null)?.name ?? "—",
      cell: (r) => (r.distribution_transformers as { name: string } | null)?.name ?? "",
    },
    { key: "tariff_category", label: "Tariff", render: (r) => r.tariff_category, cell: (r) => r.tariff_category },
    { key: "connection_type", label: "Type", render: (r) => `${r.connection_type} · ${r.phase}`, cell: (r) => r.connection_type },
    {
      key: "sanctioned_load_kw",
      label: "Sanctioned",
      align: "right",
      render: (r) => <span className="mono">{r.sanctioned_load_kw != null ? `${r.sanctioned_load_kw} kW` : "—"}</span>,
      cell: (r) => String(r.sanctioned_load_kw ?? ""),
    },
    {
      key: "meter",
      label: "Meter",
      render: (r) => {
        const m = Array.isArray(r.meters) ? r.meters[0] : (r.meters as { status: string } | null);
        const status = m?.status ?? "none";
        return (
          <span style={{ color: status === "active" ? "var(--color-status-good)" : "var(--color-status-serious)" }}>
            {status}
          </span>
        );
      },
      cell: (r) => {
        const m = Array.isArray(r.meters) ? r.meters[0] : (r.meters as { status: string } | null);
        return m?.status ?? "none";
      },
    },
  ];

  return (
    <PanelShell panel="admin" email={user.email ?? ""} nav={adminNav("/admin/consumers")}>
      <h1 className="text-2xl font-semibold mb-1">All consumers</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        Every service connection across every division. {rows.length} total.
      </p>
      <AdminTable rows={rows} columns={columns} searchPlaceholder="Search by consumer number, DT, tariff…" />
    </PanelShell>
  );
}
