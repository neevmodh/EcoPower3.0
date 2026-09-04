import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { PanelIcon } from "@/components/Icon";
import { ChartFrame, LegendDot } from "@/components/charts/ChartFrame";
import { AreaChart } from "@/components/charts/AreaChart";
import { RankedBar, type RankedRow } from "@/components/charts/RankedBar";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type LossRow = { dt_id: string; dt_name: string; loss_pct: number; delivered_kwh?: number; consumed_kwh?: number };

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

  // Division load curve — hourly import vs behind-meter solar export, last
  // 48h. RLS on meter_readings (via the SECURITY INVOKER rollup, 0031)
  // confines it to this officer's division.
  const { data: loadRaw } = (await supabase.rpc("division_load_profile", { p_hours: 48 })) as {
    data: Array<{ bucket: string; import_kwh: number; export_kwh: number; meters: number }> | null;
  };
  const load = (loadRaw ?? []).map((r) => ({
    bucket: r.bucket,
    importKwh: Number(r.import_kwh),
    exportKwh: Number(r.export_kwh),
  }));
  const loadLabels = load.map((r) =>
    new Date(r.bucket).toLocaleString("en-IN", { day: "numeric", hour: "2-digit", hour12: false }),
  );
  const importDay = load.slice(-24).reduce((s, r) => s + r.importKwh, 0);
  const exportDay = load.slice(-24).reduce((s, r) => s + r.exportKwh, 0);
  const solarShare = importDay + exportDay > 0 ? (exportDay / (importDay + exportDay)) * 100 : null;

  const totalConsumers = connections?.length ?? 0;
  const totalDts = dts?.length ?? 0;
  const activeMeters = (meters ?? []).filter((m) => m.status === "active").length;
  const avgLossPct =
    lossRows && lossRows.length > 0
      ? lossRows.reduce((sum: number, r: { loss_pct: number }) => sum + Number(r.loss_pct), 0) / lossRows.length
      : null;
  const worstDt = lossRows && lossRows.length > 0 ? [...lossRows].sort((a, b) => b.loss_pct - a.loss_pct)[0] : null;

  const lossBarRows: RankedRow[] = ((lossRows ?? []) as LossRow[]).map((r) => {
    const pct = Number(r.loss_pct);
    const color =
      pct < 0
        ? "var(--color-text-tertiary)"
        : pct > 15
          ? "var(--color-status-serious)"
          : pct > 10
            ? "var(--color-status-warning)"
            : "var(--color-status-good)";
    const basis =
      r.delivered_kwh != null && r.consumed_kwh != null
        ? `${Number(r.delivered_kwh).toFixed(0)} kWh delivered · ${Number(r.consumed_kwh).toFixed(0)} kWh metered`
        : "Click to localize this DT's loss →";
    return {
      key: r.dt_id,
      label: r.dt_name,
      value: pct,
      color,
      display: `${pct.toFixed(1)}%`,
      note: pct < 0 ? `${basis} — metered exceeds delivered, check the DT-head meter` : basis,
      href: `/discom/losses/${r.dt_id}`,
    };
  });

  return (
    <PanelShell
      scopeNote={`division_ids · ${divisionIds.length} claim${divisionIds.length === 1 ? "" : "s"}`}
      panel="discom"
      email={user.email ?? ""}
      nav={[
        { href: "/discom", label: "Overview", active: true },
        { href: "/discom/connections", label: "Connections" },
        { href: "/discom/losses", label: "AT&C losses" },
        { href: "/discom/netmetering", label: "Net-metering" },
        { href: "/discom/prepaid", label: "Prepaid" },
        { href: "/discom/outages", label: "Outages" },
        { href: "/discom/audit", label: "Audit log" },
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
        <div className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Division import · 24h</div>
          <div className="text-2xl font-semibold tabular">{load.length > 0 ? `${importDay.toFixed(0)} kWh` : "—"}</div>
        </div>
        <div className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Behind-meter solar share</div>
          <div className="text-2xl font-semibold tabular" style={{ color: "var(--color-diverging-export)" }}>
            {solarShare != null ? `${solarShare.toFixed(1)}%` : "—"}
          </div>
        </div>
      </div>

      {load.length >= 2 && (
        <div className="mb-8">
          <ChartFrame
            title="Division load vs behind-meter solar"
            caption="Hourly totals across every metered connection in your division, last 48 hours"
            legend={
              <>
                <LegendDot color="var(--color-diverging-import)">Grid import</LegendDot>
                <LegendDot color="var(--color-diverging-export)">Solar export</LegendDot>
              </>
            }
            table={
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left border-b" style={{ borderColor: "var(--color-border)" }}>
                    <th className="py-1.5 pr-4 font-medium" style={{ color: "var(--color-text-secondary)" }}>Hour</th>
                    <th className="py-1.5 pr-4 font-medium text-right" style={{ color: "var(--color-text-secondary)" }}>Import</th>
                    <th className="py-1.5 font-medium text-right" style={{ color: "var(--color-text-secondary)" }}>Export</th>
                  </tr>
                </thead>
                <tbody>
                  {load
                    .slice()
                    .reverse()
                    .map((r) => (
                      <tr key={r.bucket} className="border-b last:border-b-0" style={{ borderColor: "var(--color-border)" }}>
                        <td className="py-1 pr-4 mono">{new Date(r.bucket).toLocaleString("en-GB")}</td>
                        <td className="py-1 pr-4 text-right mono">{r.importKwh.toFixed(2)}</td>
                        <td className="py-1 text-right mono">{r.exportKwh.toFixed(2)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            }
          >
            <AreaChart
              unit="kWh"
              labels={loadLabels}
              series={[
                { key: "imp", label: "Grid import", color: "var(--color-diverging-import)", points: load.map((r) => r.importKwh) },
                { key: "exp", label: "Solar export", color: "var(--color-diverging-export)", points: load.map((r) => r.exportKwh) },
              ]}
            />
          </ChartFrame>
        </div>
      )}

      {lossBarRows.length > 0 && (
        <div className="mb-6">
          <ChartFrame
            title="AT&C loss by distribution transformer"
            caption="Delivered vs metered over 120 days — RDSS targets 12–15%. Click a bar to localize."
            table={
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left border-b" style={{ borderColor: "var(--color-border)" }}>
                    <th className="py-1.5 pr-4 font-medium" style={{ color: "var(--color-text-secondary)" }}>DT</th>
                    <th className="py-1.5 pr-4 font-medium text-right" style={{ color: "var(--color-text-secondary)" }}>Delivered</th>
                    <th className="py-1.5 pr-4 font-medium text-right" style={{ color: "var(--color-text-secondary)" }}>Metered</th>
                    <th className="py-1.5 font-medium text-right" style={{ color: "var(--color-text-secondary)" }}>Loss</th>
                  </tr>
                </thead>
                <tbody>
                  {((lossRows ?? []) as LossRow[])
                    .slice()
                    .sort((a, b) => Number(b.loss_pct) - Number(a.loss_pct))
                    .map((r) => (
                      <tr key={r.dt_id} className="border-b last:border-b-0" style={{ borderColor: "var(--color-border)" }}>
                        <td className="py-1 pr-4">{r.dt_name}</td>
                        <td className="py-1 pr-4 text-right mono">{Number(r.delivered_kwh).toFixed(0)}</td>
                        <td className="py-1 pr-4 text-right mono">{Number(r.consumed_kwh).toFixed(0)}</td>
                        <td className="py-1 text-right mono">{Number(r.loss_pct).toFixed(1)}%</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            }
          >
            <RankedBar rows={lossBarRows} unit="" />
          </ChartFrame>
        </div>
      )}

      {worstDt && (
        <div
          className="rounded-card border card-shadow p-5 mb-2"
          style={{
            borderColor: worstDt.loss_pct > 15 ? "var(--color-status-serious)" : "var(--color-border)",
            background: worstDt.loss_pct > 15 ? "color-mix(in oklab, var(--color-status-serious) 6%, var(--color-surface-card))" : "var(--color-surface-card)",
          }}
        >
          <div className="text-sm font-semibold mb-1">
            <span className="inline-flex items-center gap-2">
              {worstDt.loss_pct > 15 && (
                <span style={{ color: "var(--color-status-serious)" }}>
                  <PanelIcon name="alert" size={15} />
                </span>
              )}
              {worstDt.loss_pct > 15 ? "Worst-performing DT this period" : "Best-performing DT this period"}
            </span>
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
