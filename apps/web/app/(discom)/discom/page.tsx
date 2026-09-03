import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Server Component. Reads Supabase with the anon key + the user's session
// cookie — no service_role, no ?role=. Every query below has no WHERE
// clause on division: RLS (#5) is what makes it return only this
// officer's division, for every table, including the DT loss aggregation.
export default async function DiscomPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user, divisionIds } = scope;

  const { data: connections } = await supabase
    .from("service_connections")
    .select("id, dt_id");

  const { data: dts } = await supabase.from("distribution_transformers").select("id, name, capacity_kva");

  const { data: meters } = await supabase.from("meters").select("id, status, dt_id, service_connection_id");

  const { data: lossRows } = await supabase.rpc("dt_loss_summary");

  const totalConsumers = connections?.length ?? 0;
  const totalDts = dts?.length ?? 0;
  const activeMeters = (meters ?? []).filter((m) => m.status === "active").length;
  const avgLossPct =
    lossRows && lossRows.length > 0
      ? lossRows.reduce((sum: number, r: { loss_pct: number }) => sum + Number(r.loss_pct), 0) / lossRows.length
      : null;
  const worstDt = lossRows && lossRows.length > 0 ? [...lossRows].sort((a, b) => b.loss_pct - a.loss_pct)[0] : null;

  return (
    <PanelShell
      panel="discom"
      email={user.email ?? ""}
      nav={[
        { href: "/discom", label: "Overview", active: true },
        { href: "/discom/connections", label: "Connections" },
        { href: "/discom/losses", label: "AT&C losses" },
        { href: "/discom/netmetering", label: "Net-metering" },
      ]}
    >
      <h1 className="text-2xl font-semibold mb-1">Division overview</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        Scope claim covers {divisionIds.length} division{divisionIds.length === 1 ? "" : "s"}. Every number below is
        unfiltered by this query — RLS is what confines it.
      </p>

      <div className="grid gap-4 mb-8" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
        <div className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Service connections</div>
          <div className="text-2xl font-semibold tabular">{totalConsumers}</div>
        </div>
        <div className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Distribution transformers</div>
          <div className="text-2xl font-semibold tabular">{totalDts}</div>
        </div>
        <div className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Active meters</div>
          <div className="text-2xl font-semibold tabular">{activeMeters}</div>
        </div>
        <div className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Avg. AT&C loss</div>
          <div className="text-2xl font-semibold tabular" style={{ color: avgLossPct != null && avgLossPct > 15 ? "var(--color-status-serious)" : "var(--color-status-good)" }}>
            {avgLossPct != null ? `${avgLossPct.toFixed(1)}%` : "—"}
          </div>
        </div>
      </div>

      {worstDt && (
        <div
          className="rounded-card border card-shadow p-5 mb-2"
          style={{
            borderColor: worstDt.loss_pct > 15 ? "var(--color-status-serious)" : "var(--color-border)",
            background: worstDt.loss_pct > 15 ? "color-mix(in oklab, var(--color-status-serious) 6%, var(--color-surface-card))" : "var(--color-surface-card)",
          }}
        >
          <div className="text-sm font-semibold mb-1">
            {worstDt.loss_pct > 15 ? "⚠️ Worst-performing DT this period" : "Best-performing DT this period"}
          </div>
          <div className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            <strong>{worstDt.dt_name}</strong> — {Number(worstDt.loss_pct).toFixed(1)}% loss over the last 120 days,
            computed from real delivered-vs-consumed meter reads.{" "}
            <a href={`/discom/losses/${worstDt.dt_id}`} className="underline">
              Localize it →
            </a>
          </div>
        </div>
      )}
    </PanelShell>
  );
}
