import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { InspectionPanel } from "@/components/InspectionPanel";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type InspectionRow = {
  id: string;
  inspection_type: string;
  status: string;
  findings: string | null;
  started_at: string;
  completed_at: string | null;
  checklist: unknown;
  service_connections: unknown;
};

export default async function FieldInspectionsPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  const { data: workOrders } = await supabase
    .from("work_orders")
    .select("id, title, service_connection_id, service_connections(consumer_number)")
    .in("status", ["open", "in_progress"])
    .order("created_at", { ascending: false });

  const { data: inspRaw } = await supabase
    .from("site_inspections")
    .select(
      "id, inspection_type, status, findings, started_at, completed_at, checklist, service_connections(consumer_number)",
    )
    .order("started_at", { ascending: false })
    .limit(30);

  const inspections = ((inspRaw ?? []) as InspectionRow[]).map((r) => ({
    id: r.id,
    inspection_type: r.inspection_type,
    status: r.status,
    findings: r.findings,
    started_at: r.started_at,
    completed_at: r.completed_at,
    checklist: (Array.isArray(r.checklist) ? r.checklist : []) as Array<{ item: string; ok: boolean | null; note?: string }>,
    consumer_number: (r.service_connections as unknown as { consumer_number: string } | null)?.consumer_number ?? "—",
  }));

  return (
    <PanelShell
      panel="field"
      email={user.email ?? ""}
      nav={[
        { href: "/field", label: "My jobs" },
        { href: "/field/readings", label: "Meter reviews" },
        { href: "/field/inspections", label: "Inspections", active: true },
      ]}
    >
      <h1 className="text-2xl font-semibold mb-1">Site inspections</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        A structured checklist per visit — tamper, roof survey, commissioning or routine. Start one from an open work
        order; the record is yours and visible to the RESCO and the consumer.
      </p>

      <InspectionPanel
        userId={user.id}
        workOrders={(workOrders ?? []).map((w) => ({
          id: w.id,
          title: w.title,
          service_connection_id: w.service_connection_id,
          consumer_number:
            (w.service_connections as unknown as { consumer_number: string } | null)?.consumer_number ?? "—",
        }))}
        inspections={inspections}
      />
    </PanelShell>
  );
}
