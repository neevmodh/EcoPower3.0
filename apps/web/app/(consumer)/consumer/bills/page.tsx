import { redirect } from "next/navigation";
import { formatInrFromPaise } from "@ecopower/shared";
import { PanelShell } from "@/components/PanelShell";
import { consumerNav } from "@/lib/panelNav";
import { InvoiceCard } from "@/components/InvoiceCard";
import { CsvExportButton } from "@/components/CsvExportButton";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ConsumerBillsPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  const { data: invoices } = await supabase
    .from("invoices")
    .select(
      "id, billing_period_start, billing_period_end, units_imported_milli_kwh, total_paise, status, invoice_lines(id, line_type, label, amount_paise, slab_from, slab_to, source_reading_start_ts, source_reading_end_ts), service_connections(consumer_number)",
    )
    .order("billing_period_start", { ascending: false });

  const totalPaise = (invoices ?? []).reduce((sum, i) => sum + Number(i.total_paise), 0);

  const csvRows = (invoices ?? []).map((i) => ({
    period_start: i.billing_period_start,
    period_end: i.billing_period_end,
    units_kwh: (i.units_imported_milli_kwh / 1000).toFixed(1),
    amount_inr: (i.total_paise / 100).toFixed(2),
    status: i.status,
  }));

  return (
    <PanelShell
      panel="consumer"
      email={user.email ?? ""}
      nav={consumerNav("/consumer/bills")}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Bills</h1>
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {(invoices ?? []).length} invoice{(invoices ?? []).length === 1 ? "" : "s"}, {formatInrFromPaise(BigInt(totalPaise))} total
          </p>
        </div>
        {(invoices ?? []).length > 0 && <CsvExportButton filename="ecopower-bills.csv" rows={csvRows} />}
      </div>

      {(invoices ?? []).length === 0 ? (
        <p style={{ color: "var(--color-text-secondary)" }}>No invoices yet.</p>
      ) : (
        <div className="space-y-3">
          {(invoices ?? []).map((invoice) => (
            <InvoiceCard
              key={invoice.id}
              invoice={invoice}
              consumerNumber={(invoice.service_connections as unknown as { consumer_number: string } | null)?.consumer_number ?? "—"}
            />
          ))}
        </div>
      )}
    </PanelShell>
  );
}
