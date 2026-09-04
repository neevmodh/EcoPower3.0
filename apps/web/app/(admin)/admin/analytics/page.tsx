import { redirect } from "next/navigation";
import { formatInrFromPaise } from "@ecopower/shared";
import { PanelShell } from "@/components/PanelShell";
import { adminNav } from "@/lib/panelNav";
import { ChartFrame, LegendDot } from "@/components/charts/ChartFrame";
import { AreaChart } from "@/components/charts/AreaChart";
import { RankedBar, type RankedRow } from "@/components/charts/RankedBar";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type LoadRow = { bucket: string; import_kwh: number; export_kwh: number; meters: number };

export default async function AdminAnalyticsPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  const [loadResult, { data: divisions }, { data: connections }, { data: invoices }, { data: tickets }] =
    await Promise.all([
      supabase.rpc("division_load_profile", { p_hours: 48 }),
      supabase.from("discom_divisions").select("id, name"),
      supabase.from("service_connections").select("id, division_id"),
      supabase.from("invoices").select("total_paise, service_connections(division_id)"),
      supabase.from("support_tickets").select("status"),
    ]);

  const { data: loadRaw } = loadResult as { data: LoadRow[] | null };
  const load = (loadRaw ?? []).map((r) => ({
    importKwh: Number(r.import_kwh),
    exportKwh: Number(r.export_kwh),
  }));
  const labels = (loadRaw ?? []).map((r) =>
    new Date(r.bucket).toLocaleString("en-IN", { day: "numeric", hour: "2-digit", hour12: false }),
  );

  const divName = new Map((divisions ?? []).map((d) => [d.id, d.name]));

  const connByDiv = new Map<string, number>();
  for (const c of connections ?? []) {
    if (!c.division_id) continue;
    connByDiv.set(c.division_id, (connByDiv.get(c.division_id) ?? 0) + 1);
  }
  const connRows: RankedRow[] = [...connByDiv.entries()]
    .map(([id, n]) => ({
      key: id,
      label: divName.get(id) ?? id.slice(0, 8),
      value: n,
      color: "var(--color-categorical-consumption)",
      display: n.toLocaleString("en-IN"),
    }))
    .sort((a, b) => b.value - a.value);

  const invByDiv = new Map<string, number>();
  for (const inv of invoices ?? []) {
    const sc = inv.service_connections as { division_id: string | null } | { division_id: string | null }[] | null;
    const d = (Array.isArray(sc) ? sc[0]?.division_id : sc?.division_id) ?? null;
    if (!d) continue;
    invByDiv.set(d, (invByDiv.get(d) ?? 0) + Number(inv.total_paise));
  }
  const invRows: RankedRow[] = [...invByDiv.entries()]
    .map(([id, paise]) => ({
      key: id,
      label: divName.get(id) ?? id.slice(0, 8),
      value: paise,
      color: "var(--color-categorical-third)",
      display: formatInrFromPaise(BigInt(Math.round(paise))),
    }))
    .sort((a, b) => b.value - a.value);

  const ticketByStatus = new Map<string, number>();
  for (const t of tickets ?? []) ticketByStatus.set(t.status, (ticketByStatus.get(t.status) ?? 0) + 1);

  return (
    <PanelShell panel="admin" email={user.email ?? ""} nav={adminNav("/admin/analytics")}>
      <h1 className="text-2xl font-semibold mb-1">Cross-tenant analytics</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        Aggregated across every division — the one view without an RLS scope. Load is the last 48 hours of metered import
        vs behind-meter solar export, platform-wide.
      </p>

      <div className="space-y-6">
        <ChartFrame
          title="Platform load — import vs solar export"
          caption="Hourly, all divisions, last 48 h"
          legend={
            <>
              <LegendDot color="var(--color-categorical-consumption)">Grid import</LegendDot>
              <LegendDot color="var(--color-categorical-generation)">Solar export</LegendDot>
            </>
          }
        >
          {load.length > 0 ? (
            <AreaChart
              labels={labels}
              unit="kWh"
              valueDigits={0}
              series={[
                { key: "imp", label: "Grid import", color: "var(--color-categorical-consumption)", points: load.map((r) => r.importKwh) },
                { key: "exp", label: "Solar export", color: "var(--color-categorical-generation)", points: load.map((r) => r.exportKwh) },
              ]}
            />
          ) : (
            <p className="text-sm py-8 text-center" style={{ color: "var(--color-text-tertiary)" }}>
              No readings in the window yet.
            </p>
          )}
        </ChartFrame>

        <div className="grid gap-6 md:grid-cols-2">
          <ChartFrame title="Consumers by division" caption={`${(connections ?? []).length} connections total`}>
            {connRows.length > 0 ? <RankedBar rows={connRows} /> : <Empty />}
          </ChartFrame>
          <ChartFrame title="Invoiced value by division" caption="All-time, all issued invoices">
            {invRows.length > 0 ? <RankedBar rows={invRows} /> : <Empty />}
          </ChartFrame>
        </div>

        <div
          className="rounded-card border card-shadow p-5"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
        >
          <h2 className="text-base font-semibold mb-3">Support tickets by status</h2>
          <div className="flex flex-wrap gap-3">
            {["open", "in_progress", "resolved", "closed"].map((s) => (
              <div
                key={s}
                className="rounded-card border px-4 py-2"
                style={{ borderColor: "var(--color-border)" }}
              >
                <div className="text-xs" style={{ color: "var(--color-text-secondary)" }}>{s.replace("_", " ")}</div>
                <div className="text-xl font-semibold tabular">{ticketByStatus.get(s) ?? 0}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PanelShell>
  );
}

function Empty() {
  return (
    <p className="text-sm py-8 text-center" style={{ color: "var(--color-text-tertiary)" }}>
      Nothing to chart yet.
    </p>
  );
}
