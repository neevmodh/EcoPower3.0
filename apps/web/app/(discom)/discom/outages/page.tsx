import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { OutageConsole } from "@/components/OutageConsole";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type OutageRow = {
  id: string;
  outage_type: string;
  cause: string | null;
  consumers_affected: number | null;
  started_at: string;
  estimated_restoration: string | null;
  restored_at: string | null;
  status: string;
  feeder_id: string | null;
  dt_id: string | null;
  division_id: string;
  outage_updates: Array<{ id: string; note: string; new_eta: string | null; posted_at: string }>;
};

export default async function DiscomOutagesPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user, divisionIds } = scope;

  const [{ data: outagesRaw }, { data: feeders }, { data: dts }] = await Promise.all([
    supabase
      .from("outages")
      .select(
        "id, outage_type, cause, consumers_affected, started_at, estimated_restoration, restored_at, status, feeder_id, dt_id, division_id, outage_updates(id, note, new_eta, posted_at)",
      )
      .order("started_at", { ascending: false }),
    supabase.from("feeders").select("id, name").order("name"),
    supabase.from("distribution_transformers").select("id, name, feeder_id").order("name"),
  ]);

  const outages = ((outagesRaw ?? []) as OutageRow[]).map((o) => ({
    id: o.id,
    outage_type: o.outage_type,
    cause: o.cause,
    consumers_affected: o.consumers_affected,
    started_at: o.started_at,
    estimated_restoration: o.estimated_restoration,
    restored_at: o.restored_at,
    status: o.status,
    feeder_id: o.feeder_id,
    dt_id: o.dt_id,
    updates: [...(o.outage_updates ?? [])].sort((a, b) => a.posted_at.localeCompare(b.posted_at)),
  }));

  const activeCount = outages.filter((o) => o.status === "active" || o.status === "partial_restore").length;
  const affectedNow = outages
    .filter((o) => o.status === "active")
    .reduce((s, o) => s + (o.consumers_affected ?? 0), 0);

  return (
    <PanelShell
      scopeNote={`division_ids · ${divisionIds.length} claim${divisionIds.length === 1 ? "" : "s"}`}
      panel="discom"
      email={user.email ?? ""}
      nav={[
        { href: "/discom", label: "Overview" },
        { href: "/discom/connections", label: "Connections" },
        { href: "/discom/losses", label: "AT&C losses" },
        { href: "/discom/netmetering", label: "Net-metering" },
        { href: "/discom/prepaid", label: "Prepaid" },
        { href: "/discom/outages", label: "Outages", active: true },
        { href: "/discom/audit", label: "Audit log" },
      ]}
    >
      <h1 className="text-2xl font-semibold mb-1">Outage management</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        {activeCount} active · {affectedNow.toLocaleString("en-IN")} consumers off right now. Every write here is confined
        to your division by RLS.
      </p>

      {divisionIds.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          This session has no division claim.
        </p>
      ) : (
        <OutageConsole
          divisionId={divisionIds[0]}
          feeders={feeders ?? []}
          dts={(dts ?? []).map((d) => ({ id: d.id, name: d.name, feeder_id: d.feeder_id }))}
          outages={outages}
        />
      )}
    </PanelShell>
  );
}
